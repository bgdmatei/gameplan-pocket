import pg from 'pg';
import { z } from 'zod';
import type { Logger } from '../../logger';
import { POKE_CHANNEL } from './channel';
import type { PokeHub } from './hub';

const notificationSchema = z.strictObject({
  u: z.string().min(1),
  s: z.number().int().positive(),
});

/** Equal jitter, 1 s doubling to 30 s; reset only by a connection that lasted. */
const RECONNECT = { baseMs: 1_000, maxMs: 30_000 } as const;

export type PokeListener = {
  /** Rejects if the first connection fails; later drops reconnect on their own. */
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

/**
 * The process's one LISTEN connection (ADR-012). It needs a direct URL: a
 * transaction-mode pooler hands each statement a different server connection.
 */
export const createPokeListener = ({
  connectionString,
  hub,
  logger,
  currentSeq,
}: {
  connectionString: string;
  hub: PokeHub;
  logger: Logger;
  /** The account's log position, for the re-poke after a reconnect. */
  currentSeq: (userId: string) => Promise<number>;
}): PokeListener => {
  // Listening; or still connecting, so stop() can end it either way.
  let client: pg.Client | null = null;
  let connecting: pg.Client | null = null;
  let connectedAt = 0;
  let stopped = false;
  let failures = 0;
  let retry: ReturnType<typeof setTimeout> | null = null;

  const onNotification = ({ channel, payload }: pg.Notification) => {
    if (channel !== POKE_CHANNEL) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload ?? '');
    } catch {
      parsed = undefined;
    }
    const notification = notificationSchema.safeParse(parsed);
    if (!notification.success) {
      logger.warn('Poke listener dropped a malformed notification.');
      return;
    }
    hub.deliver(notification.data.u, notification.data.s);
  };

  const discard = (old: pg.Client) => {
    old.removeListener('notification', onNotification);
    void old.end().catch(() => undefined);
  };

  // A pg.Client can't reconnect, so every attempt gets a new one. It counts
  // as current only once listening: a failed connect also emits 'end', and
  // must not schedule a second retry beside the caller's.
  const connect = async (): Promise<void> => {
    // A LISTEN-only connection sends nothing, so without keepalive a silently
    // dropped one would never report an error.
    const next = new pg.Client({ connectionString, keepAlive: true });
    next.on('notification', onNotification);
    // Unhandled, a lost connection's 'error' event would crash the process.
    next.on('error', (error) => lost(next, error.name));
    next.on('end', () => lost(next, 'end'));
    connecting = next;
    try {
      await next.connect();
      await next.query(`LISTEN ${POKE_CHANNEL}`);
    } catch (error) {
      discard(next);
      throw error;
    } finally {
      connecting = null;
    }
    if (stopped) {
      discard(next);
      return;
    }
    client = next;
    connectedAt = Date.now();
  };

  const lost = (from: pg.Client, reason: string) => {
    if (stopped || client !== from) return;
    client = null;
    discard(from);
    // A connection that dropped soon after opening keeps the backoff climbing.
    if (Date.now() - connectedAt >= RECONNECT.maxMs) failures = 0;
    logger.warn(`Poke listener connection lost (${reason}); reconnecting.`);
    schedule();
  };

  const schedule = () => {
    if (stopped) return;
    failures += 1;
    const step = Math.min(RECONNECT.maxMs, RECONNECT.baseMs * 2 ** (failures - 1));
    retry = setTimeout(() => void reconnect(), step / 2 + (Math.random() * step) / 2);
  };

  const reconnect = async () => {
    retry = null;
    if (stopped) return;
    try {
      await connect();
    } catch (error) {
      if (stopped) return;
      logger.warn(
        `Poke listener reconnect failed: ${error instanceof Error ? error.name : 'unknown'}.`,
      );
      schedule();
      return;
    }
    if (stopped) return;
    logger.warn('Poke listener reconnected.');
    // Notifications sent while disconnected are gone: tell every open stream
    // where its account is now, and the phone pulls whatever it missed.
    let missed = 0;
    await Promise.all(
      hub.accounts().map(async (userId) => {
        try {
          hub.deliver(userId, await currentSeq(userId));
        } catch {
          missed += 1;
        }
      }),
    );
    if (missed > 0) logger.warn(`Poke listener could not re-poke ${missed} accounts.`);
  };

  return {
    start: () => connect(),
    stop: async () => {
      stopped = true;
      if (retry !== null) clearTimeout(retry);
      for (const open of [client, connecting]) if (open !== null) discard(open);
      client = null;
    },
  };
};
