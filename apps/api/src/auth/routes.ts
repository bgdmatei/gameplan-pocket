import { codeRequestSchema, refreshRequestSchema, verifyRequestSchema } from '@gameplan/contracts';
import type { ErrorResponse, RefreshResponse, VerifyResponse } from '@gameplan/contracts';
import { Hono } from 'hono';
import { parseBody } from '../parse-body';
import type { AuthService } from './service';

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
    if (result.kind === 'library_owner_mismatch') {
      return c.json({ error: 'library_owner_mismatch' } satisfies ErrorResponse, 409);
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

  // 204 always, so it is safe to repeat and says nothing about the token.
  routes.post('/logout', async (c) => {
    const body = await parseBody(c, refreshRequestSchema);
    if (!body.ok) return c.json(body.error, 400);
    await service.logout(body.data.refreshToken);
    return c.body(null, 204);
  });

  return routes;
};
