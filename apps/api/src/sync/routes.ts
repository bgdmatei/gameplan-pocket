import { pullQuerySchema, pushRequestSchema, snapshotQuerySchema } from '@gameplan/contracts';
import type {
  ErrorResponse,
  PullResponse,
  PushResponse,
  SnapshotResponse,
} from '@gameplan/contracts';
import { POKE_EVENT } from '@gameplan/contracts';
import type { Poke } from '@gameplan/contracts';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { requireUser } from '../auth/middleware';
import type { UserVariables } from '../auth/middleware';
import type { AuthService } from '../auth/service';
import type { Logger } from '../logger';
import { parseBody, parseQuery } from '../parse-body';
import type { PokeHub } from './events/hub';
import type { SyncService } from './service';
import { protocolOf, schemaReadBy } from '../version-gate';
import type { ProtocolRange } from '../version-gate';

/** Often enough that proxies keep an idle stream open, and the phone's 60 s stall check never trips on a live one. */
export const HEARTBEAT_MS = 25_000;

/**
 * The sync HTTP surface (SPEC-sync-transport.md). Every route is signed in,
 * and the user comes from the token alone: nothing in a body or query can
 * name whose log an op lands in.
 */
export const createSyncRoutes = (
  sync: SyncService,
  auth: AuthService,
  protocols: ProtocolRange,
  { pokes, logger }: { pokes: PokeHub; logger: Logger },
): Hono<{ Variables: UserVariables }> => {
  const routes = new Hono<{ Variables: UserVariables }>();
  routes.use('*', requireUser(auth));

  const reads = (c: Context) => schemaReadBy(protocolOf(c, protocols) ?? protocols.max);

  routes.post('/push', async (c) => {
    const body = await parseBody(c, pushRequestSchema);
    if (!body.ok) return c.json(body.error, 400);
    const result = await sync.push(c.get('user').userId, body.data.ops);
    return c.json(result satisfies PushResponse);
  });

  routes.get('/pull', async (c) => {
    const query = parseQuery(c, pullQuerySchema);
    if (!query.ok) return c.json(query.error, 400);
    const result = await sync.pull(c.get('user').userId, query.data, reads(c));
    return c.json(result satisfies PullResponse);
  });

  routes.get('/snapshot', async (c) => {
    const query = parseQuery(c, snapshotQuerySchema);
    if (!query.ok) return c.json(query.error, 400);
    const result = await sync.snapshot(c.get('user').userId, query.data, reads(c));
    if (result === 'invalid_cursor') {
      return c.json({ error: 'invalid_request', fields: ['cursor'] } satisfies ErrorResponse, 400);
    }
    return c.json(result satisfies SnapshotResponse);
  });

  routes.get('/events', (c) => {
    const { userId, deviceId, expiresInMs } = c.get('user');
    return streamSSE(c, async (stream) => {
      // The opening read can finish after a live poke for a later push: only ever send higher.
      let sent = -1;
      const poke = (seq: number) => {
        if (seq <= sent) return;
        sent = seq;
        void stream.writeSSE({ event: POKE_EVENT, data: JSON.stringify({ seq } satisfies Poke) });
      };
      // Ends on the client leaving, the hub replacing it, or the token expiring;
      // the phone reconnects with a fresh token.
      let end = (): void => undefined;
      const ended = new Promise<void>((resolve) => {
        end = resolve;
      });
      stream.onAbort(end);
      const expiry = setTimeout(end, expiresInMs);
      // Registered before reading the position: a push committing in between is still heard.
      const unregister = pokes.register(userId, { deviceId, poke, close: end });
      const heartbeat = setInterval(() => void stream.write(':\n\n'), HEARTBEAT_MS);
      try {
        poke(await sync.lastSeq(userId));
        await ended;
      } catch (error) {
        logger.warn(
          `sync events stream failed: ${error instanceof Error ? error.name : 'unknown'}`,
        );
      } finally {
        clearTimeout(expiry);
        clearInterval(heartbeat);
        unregister();
      }
    });
  });

  return routes;
};
