import { HEADERS } from '@gameplan/contracts';
import type { ErrorResponse } from '@gameplan/contracts';
import type { Context, MiddlewareHandler } from 'hono';

export type ProtocolRange = { min: number; max: number };

// Protocol 3 reads note conflicts; 2 is served without them (ADR-009, ADR-017).
export const SERVED_PROTOCOLS: ProtocolRange = { min: 2, max: 3 };

/** The protocol an answer is shaped for: 3, or 2 for any app below it. */
export const servedAs = (protocol: number): 2 | 3 => (protocol >= 3 ? 3 : 2);

// No header counts as current: every app build sends one, only tools and tests don't.
export const protocolOf = (c: Context, range: ProtocolRange): number | null => {
  const header = c.req.header(HEADERS.protocolVersion);
  if (header === undefined) return range.max;
  return /^\d{1,4}$/.test(header) ? Number(header) : null;
};

// Newer than the server isn't "update required": no update exists, so that app just retries.
export const createVersionGate =
  (range: ProtocolRange): MiddlewareHandler =>
  async (c, next) => {
    const protocol = protocolOf(c, range);
    if (protocol !== null && protocol < range.min) {
      return c.json({ error: 'update_required' } satisfies ErrorResponse, 426);
    }
    if (protocol === null || protocol > range.max) {
      return c.json({ error: 'unsupported_protocol' } satisfies ErrorResponse, 400);
    }
    await next();
  };
