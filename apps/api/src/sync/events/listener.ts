import pg from 'pg';
import { z } from 'zod';
import type { Logger } from '../../logger';
import { POKE_CHANNEL } from './channel';
import type { PokeHub } from './hub';

const notificationSchema = z.strictObject({
  u: z.string().min(1),
  s: z.number().int().positive(),
});

export type PokeListener = {
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
}: {
  connectionString: string;
  hub: PokeHub;
  logger: Logger;
}): PokeListener => {
  const client = new pg.Client({ connectionString });

  client.on('notification', ({ channel, payload }) => {
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
  });
  // Unhandled, a lost connection's 'error' event would crash the process.
  client.on('error', (error) => {
    logger.warn(`Poke listener connection failed: ${error.name}.`);
  });

  return {
    start: async () => {
      await client.connect();
      await client.query(`LISTEN ${POKE_CHANNEL}`);
    },
    stop: () => client.end(),
  };
};
