import type { ErrorResponse } from '@gameplan/contracts';
import type { Context } from 'hono';
import type { z } from 'zod';

type Parsed<T> = { ok: true; data: T } | { ok: false; error: ErrorResponse };

/**
 * The body, parsed with a contract schema. A failure names the fields only,
 * never what was sent: bodies hold emails, codes, tokens and note text.
 */
export const parseBody = async <T>(c: Context, schema: z.ZodType<T>): Promise<Parsed<T>> => {
  const raw: unknown = await c.req.json().catch(() => undefined);
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? 'body')))];
  return { ok: false, error: { error: 'invalid_request', fields } };
};
