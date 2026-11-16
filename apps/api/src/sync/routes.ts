import { pullQuerySchema, pushRequestSchema, snapshotQuerySchema } from '@gameplan/contracts';
import type {
  ErrorResponse,
  PullResponse,
  PushResponse,
  SnapshotResponse,
} from '@gameplan/contracts';
import { Hono } from 'hono';
import { requireUser } from '../auth/middleware';
import type { UserVariables } from '../auth/middleware';
import type { AuthService } from '../auth/service';
import { parseBody, parseQuery } from '../parse-body';
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

  routes.get('/pull', async (c) => {
    const query = parseQuery(c, pullQuerySchema);
    if (!query.ok) return c.json(query.error, 400);
    const result = await sync.pull(c.get('user').userId, query.data);
    return c.json(result satisfies PullResponse);
  });

  routes.get('/snapshot', async (c) => {
    const query = parseQuery(c, snapshotQuerySchema);
    if (!query.ok) return c.json(query.error, 400);
    const result = await sync.snapshot(c.get('user').userId, query.data);
    if (result === 'invalid_cursor') {
      return c.json({ error: 'invalid_request', fields: ['cursor'] } satisfies ErrorResponse, 400);
    }
    return c.json(result satisfies SnapshotResponse);
  });

  return routes;
};
