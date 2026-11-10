import { pushRequestSchema } from '@gameplan/contracts';
import type { PushResponse } from '@gameplan/contracts';
import { Hono } from 'hono';
import { requireUser } from '../auth/middleware';
import type { UserVariables } from '../auth/middleware';
import type { AuthService } from '../auth/service';
import { parseBody } from '../parse-body';
import type { SyncService } from './service';

/**
 * The sync HTTP surface (SPEC-sync-transport.md). Every route is signed in,
 * and the user comes from the token alone: nothing in a body or query can
 * name whose log an op lands in.
 */
export const createSyncRoutes = (
  sync: SyncService,
  auth: AuthService,
): Hono<{ Variables: UserVariables }> => {
  const routes = new Hono<{ Variables: UserVariables }>();
  routes.use('*', requireUser(auth));

  routes.post('/push', async (c) => {
    const body = await parseBody(c, pushRequestSchema);
    if (!body.ok) return c.json(body.error, 400);
    const result = await sync.push(c.get('user').userId, body.data.ops);
    return c.json(result satisfies PushResponse);
  });

  return routes;
};
