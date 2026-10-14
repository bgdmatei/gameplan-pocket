import type { ErrorResponse } from '@gameplan/contracts';
import { createMiddleware } from 'hono/factory';
import type { AuthService } from './service';
import type { AccessClaims } from './tokens';

/** What `requireUser` puts on the context for the handlers behind it. */
export type UserVariables = { user: AccessClaims };

const BEARER = /^Bearer (\S+)$/;

/**
 * For routes that need a signed-in user. The user and device come from the
 * verified access token and nowhere else: never a body, query or header the
 * client chose (SPEC-map.md security requirements). Any failure is the same
 * `401`, missing token or forged alike.
 */
export const requireUser = (service: AuthService) =>
  createMiddleware<{ Variables: UserVariables }>(async (c, next) => {
    const token = BEARER.exec(c.req.header('Authorization') ?? '')?.[1];
    const claims = token === undefined ? null : await service.authenticate(token);
    if (claims === null) return c.json({ error: 'unauthorized' } satisfies ErrorResponse, 401);
    c.set('user', claims);
    await next();
  });
