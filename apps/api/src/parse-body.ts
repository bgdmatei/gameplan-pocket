import type { ErrorResponse } from '@gameplan/contracts';
import type { Context } from 'hono';
import type { z } from 'zod';

export type Parsed<T> = { ok: true; data: T } | { ok: false; error: ErrorResponse };

/** The one place a failure is reported: field names only, never values. */
const parsedWith = <T>(schema: z.ZodType<T>, raw: unknown, whole: string): Parsed<T> => {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? whole)))];
  return { ok: false, error: { error: 'invalid_request', fields } };
};

/**
 * The body, parsed with a contract schema. A failure names the fields only,
 * never what was sent: bodies hold emails, codes, tokens and note text.
 */
export const parseBody = async <T>(c: Context, schema: z.ZodType<T>): Promise<Parsed<T>> => {
  const raw: unknown = await c.req.json().catch(() => undefined);
  return parsedWith(schema, raw, 'body');
};

/** The query string, parsed the same way: a failure names the fields only. */
export const parseQuery = <T>(c: Context, schema: z.ZodType<T>): Parsed<T> => {
  return parsedWith(schema, c.req.query(), 'query');
};
