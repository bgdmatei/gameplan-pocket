import { opSchema } from '../op/schema';
import { isoAt } from './entities';

/**
 * Validated against the allowlist before it is queued: an op this device could
 * not push would sit in the outbox forever.
 */
export const queue = (op: unknown, nowMs: number) => {
  const parsed = opSchema.parse(op);
  return {
    op: parsed,
    pending: { id: parsed.id, payload: JSON.stringify(parsed), createdAt: isoAt(nowMs) },
  };
};
