import type {
  PullQuery,
  PullResponse,
  PushResponse,
  SnapshotQuery,
  SnapshotResponse,
} from '@gameplan/contracts';
import { opForProtocol2, rowForProtocol2, toCurrentOp } from '@gameplan/sync';
import type { Op } from '@gameplan/sync';
import { checkOp } from '@gameplan/sync-server';
import type { Logger } from '../logger';
import { decodeCursor, encodeCursor } from './cursor';
import type { SyncRepository } from './repository';

export type SyncService = {
  /** `ops` are as the client sent them: each is checked here, at the door. */
  push: (userId: string, ops: readonly unknown[]) => Promise<PushResponse>;
  /** `reads` is the protocol the answer is shaped for. */
  pull: (userId: string, query: PullQuery, reads: 2 | 3) => Promise<PullResponse>;
  /** `invalid_cursor` for a cursor this server didn't hand out. */
  snapshot: (
    userId: string,
    query: SnapshotQuery,
    reads: 2 | 3,
  ) => Promise<SnapshotResponse | 'invalid_cursor'>;
  lastSeq: (userId: string) => Promise<number>;
};

export const createSyncService = ({
  repository,
  logger,
  now,
}: {
  repository: SyncRepository;
  logger: Logger;
  now: () => number;
}): SyncService => ({
  push: async (userId, raw) => {
    // One clock for the batch, so time passing mid-loop can't split it.
    const nowMs = now();
    const valid: Op[] = [];
    const rejected: PushResponse['rejected'] = [];

    raw.forEach((candidate, index) => {
      const result = checkOp(candidate, nowMs);
      if (result.ok) valid.push(result.op);
      else
        rejected.push({ index, reason: result.reason, ...(result.opId && { opId: result.opId }) });
    });

    const { lastSeq } = await repository.push(userId, valid);

    // Counts and reasons only: an op's fields may hold note text, which never
    // reaches a log (CLAUDE.md, privacy).
    if (rejected.length > 0) {
      const reasons = [...new Set(rejected.map(({ reason }) => reason))].join(', ');
      logger.warn(`sync push rejected ${rejected.length} of ${raw.length} ops (${reasons})`);
    }

    return { accepted: valid.map((op) => op.id), rejected, lastSeq };
  },

  pull: async (userId, query, reads) => {
    const page = await repository.pull(userId, query);
    let unreadable = 0;
    // An older server can log a v1 op mid-deploy; an unreadable op is skipped, not a 500 on every pull.
    const ops = page.ops.flatMap(({ seq, op: raw }) => {
      const op = toCurrentOp(raw);
      if (op === null) {
        unreadable += 1;
        return [];
      }
      const served = reads === 3 ? op : opForProtocol2(op);
      return served === null ? [] : [{ seq, op: served }];
    });
    if (unreadable > 0) logger.warn(`sync pull skipped ${unreadable} unreadable logged ops`);
    return { ...page, ops };
  },

  snapshot: async (userId, { cursor: text, limit }, reads) => {
    const cursor = text === undefined ? undefined : decodeCursor(text);
    if (cursor === null) return 'invalid_cursor';
    const { rows, seq, next } = await repository.snapshot(userId, { cursor, limit });
    return {
      rows: reads === 3 ? rows : rows.flatMap((row) => rowForProtocol2(row) ?? []),
      seq,
      nextCursor: next === null ? null : encodeCursor(next),
    };
  },

  lastSeq: (userId) => repository.lastSeq(userId),
});
