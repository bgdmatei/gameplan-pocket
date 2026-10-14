import { codeRequestSchema, refreshRequestSchema, verifyRequestSchema } from '@gameplan/contracts';
import type { ErrorResponse, RefreshResponse, VerifyResponse } from '@gameplan/contracts';
import type { Context } from 'hono';
import { Hono } from 'hono';
import type { z } from 'zod';
import type { AuthService } from './service';

type Parsed<T> = { ok: true; data: T } | { ok: false; error: ErrorResponse };

/**
 * The body, parsed with a contract schema. A failure names the fields only,
 * never what was sent: auth bodies hold emails, codes and tokens.
 */
const parseBody = async <T>(c: Context, schema: z.ZodType<T>): Promise<Parsed<T>> => {
  const raw: unknown = await c.req.json().catch(() => undefined);
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? 'body')))];
  return { ok: false, error: { error: 'invalid_request', fields } };
};

/** The auth HTTP surface (SPEC-auth-identity.md §API). */
export const createAuthRoutes = (service: AuthService): Hono => {
  const routes = new Hono();

  // 202 whether or not the email has an account, and whether or not a code
  // was sent: the answer never tells (attack 9).
  routes.post('/code', async (c) => {
    const body = await parseBody(c, codeRequestSchema);
    if (!body.ok) return c.json(body.error, 400);
    await service.requestCode(body.data.email);
    return c.body(null, 202);
  });

  routes.post('/verify', async (c) => {
    const body = await parseBody(c, verifyRequestSchema);
    if (!body.ok) return c.json(body.error, 400);

    const result = await service.verify(body.data);
    if (result.kind === 'invalid_code') {
      return c.json({ error: 'invalid_code' } satisfies ErrorResponse, 401);
    }
    if (result.kind === 'device_conflict') {
      return c.json({ error: 'device_conflict' } satisfies ErrorResponse, 409);
    }
    return c.json(result.value satisfies VerifyResponse);
  });

  routes.post('/refresh', async (c) => {
    const body = await parseBody(c, refreshRequestSchema);
    if (!body.ok) return c.json(body.error, 400);

    const result = await service.refresh(body.data.refreshToken);
    if (result.kind === 'unauthorized') {
      return c.json({ error: 'unauthorized' } satisfies ErrorResponse, 401);
    }
    return c.json(result.value satisfies RefreshResponse);
  });

  return routes;
};
