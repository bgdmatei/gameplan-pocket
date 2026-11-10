import type { PushResponse } from '@gameplan/contracts';
import type { Op } from '@gameplan/sync';
import { checkOp } from '@gameplan/sync-server';
import type { Logger } from '../logger';
import type { SyncRepository } from './repository';

export type SyncService = {
  /** `ops` are as the client sent them: each is checked here, at the door. */
  push: (userId: string, ops: readonly unknown[]) => Promise<PushResponse>;
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
});
