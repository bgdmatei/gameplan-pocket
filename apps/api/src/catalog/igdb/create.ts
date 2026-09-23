import type { Env } from '../../env';
import type { Logger } from '../../logger';
import { createIgdbClient } from './client';
import type { IgdbClient } from './client';
import { IGDB_LIMITS, createRateLimitedQueue } from './queue';
import { createTwitchToken } from './token';

/** The real IGDB client, wired from configuration. One per process: one queue. */
export const createIgdbFromEnv = (env: Env, logger: Logger): IgdbClient =>
  createIgdbClient({
    clientId: env.TWITCH_CLIENT_ID,
    token: createTwitchToken({
      clientId: env.TWITCH_CLIENT_ID,
      clientSecret: env.TWITCH_CLIENT_SECRET,
      now: Date.now,
    }),
    queue: createRateLimitedQueue(IGDB_LIMITS),
    logger,
  });
