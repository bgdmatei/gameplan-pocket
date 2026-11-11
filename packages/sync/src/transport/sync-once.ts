import { SYNC_LIMITS } from '@gameplan/contracts';
import type {
  PullResponse,
  PushResponse,
  SnapshotResponse,
  SnapshotRow,
} from '@gameplan/contracts';
import {
  deletePendingOps,
  getSyncState,
  listPendingOps,
  rejectPendingOps,
  updateSyncState,
} from '@gameplan/storage';
import type { Rejection, StorageAdapter } from '@gameplan/storage';
import { opSchema } from '../op/schema';
import { createSingleFlight } from '../single-flight';
import { applyRemoteOps, applySnapshot } from '../store/apply';
import { isoAt } from '../store/entities';
import type { SyncEnv } from '../store/entities';

/**
 * The server, as the loop sees it. Injected: the app passes an HTTP client
 * with the session's token, tests an in-memory server. Responses arrive
 * parsed with the contract schemas.
 */
export type SyncApi = {
  push: (ops: readonly unknown[]) => Promise<PushResponse>;
  pull: (query: { after: number; limit: number }) => Promise<PullResponse>;
  snapshot: (query: { cursor?: string; limit: number }) => Promise<SnapshotResponse>;
};

export type SyncDeps = { adapter: StorageAdapter; env: SyncEnv; api: SyncApi };

/** `skipped`: server changes to rows this device couldn't complete (#26); counts only. */
export type SyncResult = { pushed: number; rejected: number; pulled: number; skipped: number };

const entityOf = (op: unknown): string =>
  typeof op === 'object' && op !== null && 'entity' in op && typeof op.entity === 'string'
    ? op.entity
    : 'unknown';

/**
 * Sends the outbox a batch at a time. Ops leave it only once the server has
 * answered for them: acknowledged ones are dropped, refused ones move to
 * `rejected_ops`. A failed request throws and leaves the outbox as it was.
 */
const pushOutbox = async ({ adapter, env, api }: SyncDeps) => {
  let pushed = 0;
  let rejected = 0;

  for (;;) {
    const pending = await listPendingOps(adapter, { limit: SYNC_LIMITS.pushMaxOps });
    if (pending.length === 0) break;
    const ops = pending.map((op): unknown => JSON.parse(op.payload));

    const response = await api.push(ops);
    const rejectedAt = isoAt(env.now());
    // `clock_ahead` means "not yet": this device's clock runs fast, and the op
    // goes through once the server's time catches up. Dropping it would leave
    // later edits to its row without the row (review of #19). Every op queued
    // after it carries a later clock, so pushing stops for this sync.
    const later = response.rejected.filter(({ reason }) => reason === 'clock_ahead');
    const rejections = response.rejected
      .filter(({ reason }) => reason !== 'clock_ahead')
      .flatMap(({ index, reason }): Rejection[] => {
        const op = pending[index];
        return op === undefined
          ? []
          : [{ id: op.id, entity: entityOf(ops[index]), reason, rejectedAt }];
      });

    await deletePendingOps(adapter, response.accepted);
    await rejectPendingOps(adapter, rejections);
    pushed += response.accepted.length;
    rejected += rejections.length;
    if (later.length > 0) break;
    // A server that answers for none of the batch would loop here forever.
    if (response.accepted.length + rejections.length === 0) {
      throw new Error('The server answered a push without accepting or rejecting any op.');
    }
  }

  return { pushed, rejected };
};

/** Reads every snapshot page first, so one transaction applies them all. */
const bootstrap = async ({ adapter, env, api }: SyncDeps): Promise<number> => {
  const rows: SnapshotRow[] = [];
  let cursor: string | undefined;
  let seq: number | undefined;

  do {
    const page = await api.snapshot({
      ...(cursor !== undefined && { cursor }),
      limit: SYNC_LIMITS.snapshotMaxLimit,
    });
    // Later pages may hold rows newer than this position; the pull that
    // follows replays them, and the merge makes that harmless (ADR-023).
    seq ??= page.seq;
    rows.push(...page.rows);
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);

  const { skipped } = await applySnapshot(adapter, env, rows, { seq: seq ?? 0 });
  return skipped;
};

/** Pulls pages of the log until caught up; each page commits with its cursor. */
const pullLog = async ({ adapter, env, api }: SyncDeps) => {
  let after = (await getSyncState(adapter)).lastPulledSeq;
  let pulled = 0;
  let skipped = 0;

  for (;;) {
    const page = await api.pull({ after, limit: SYNC_LIMITS.pullMaxLimit });
    if (page.ops.length > 0 || page.lastSeq !== after) {
      const applied = await applyRemoteOps(
        adapter,
        env,
        page.ops.map(({ op }) => opSchema.parse(op)),
        { lastPulledSeq: page.lastSeq },
      );
      skipped += applied.skipped;
    }
    pulled += page.ops.length;
    after = page.lastSeq;
    if (!page.hasMore) return { pulled, skipped };
  }
};

/**
 * One sync (SPEC-sync-transport.md): push the outbox, bootstrap from the
 * snapshot if this device never has, then pull until caught up. Pushing first
 * means this device's own edits are in the log before it reads the log.
 */
export const syncOnce = async (deps: SyncDeps): Promise<SyncResult> => {
  const { pushed, rejected } = await pushOutbox(deps);
  const unbootstrapped = !(await getSyncState(deps.adapter)).bootstrapped;
  const skippedAtBootstrap = unbootstrapped ? await bootstrap(deps) : 0;
  const { pulled, skipped } = await pullLog(deps);
  await updateSyncState(deps.adapter, { lastSyncedAt: isoAt(deps.env.now()) });
  return { pushed, rejected, pulled, skipped: skippedAtBootstrap + skipped };
};

/** `syncOnce`, one at a time: a call made mid-sync shares one run after it. */
export const createSync = (deps: SyncDeps): (() => Promise<void>) => {
  const flight = createSingleFlight();
  return () =>
    flight(async () => {
      await syncOnce(deps);
    });
};
