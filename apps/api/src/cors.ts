import { HEADERS } from '@gameplan/contracts';
import { cors } from 'hono/cors';

/**
 * Browsers may call the API only from these origins; empty until the web app
 * exists (module 14). The phone sends no Origin and is unaffected.
 *
 * The list is always passed, even empty: Hono's default is `*`, any origin.
 * No credentials either: web sessions and their cookies arrive with module 14.
 */
export const createCors = (origins: readonly string[]) =>
  cors({
    origin: [...origins],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: [
      'Authorization',
      'Content-Type',
      HEADERS.apiKey,
      HEADERS.appVersion,
      HEADERS.protocolVersion,
    ],
    maxAge: 600,
  });
