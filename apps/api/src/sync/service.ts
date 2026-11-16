import type {
  PullQuery,
  PullResponse,
  PushResponse,
  SnapshotQuery,
  SnapshotResponse,
} from '@gameplan/contracts';
import type { Op } from '@gameplan/sync';
import { checkOp } from '@gameplan/sync-server';
import type { Logger } from '../logger';
import { decodeCursor, encodeCursor } from './cursor';
import type { SyncRepository } from './repository';

export type SyncService = {
  /** `ops` are as the client sent them: each is checked here, at the door. */
  push: (userId: string, ops: readonly unknown[]) => Promise<PushResponse>;
  pull: (userId: string, query: PullQuery) => Promise<PullResponse>;
  /** `invalid_cursor` for a cursor this server didn't hand out. */
  snapshot: (userId: string, query: SnapshotQuery) => Promise<SnapshotResponse | 'invalid_cursor'>;
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

  pull: (userId, query) => repository.pull(userId, query),

  snapshot: async (userId, { cursor: text, limit }) => {
    const cursor = text === undefined ? undefined : decodeCursor(text);
    if (cursor === null) return 'invalid_cursor';
    const { rows, seq, next } = await repository.snapshot(userId, { cursor, limit });
    return { rows, seq, nextCursor: next === null ? null : encodeCursor(next) };
  },
});
