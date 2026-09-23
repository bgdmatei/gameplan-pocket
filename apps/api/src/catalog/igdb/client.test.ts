import { describe, expect, it } from 'vitest';
import { IgdbError, createIgdbClient } from './client';
import { createRateLimitedQueue } from './queue';

const setup = (responses: Response[]) => {
  const tokens: string[] = [];
  let invalidated = 0;
  const client = createIgdbClient({
    clientId: 'id',
    token: {
      get: async () => `token-${invalidated}`,
      invalidate: () => {
        invalidated += 1;
      },
    },
    queue: createRateLimitedQueue({ perSecond: 100, maxInFlight: 8, maxWaiting: 20 }),
    logger: { warn: () => undefined },
    fetch: async (_url, init) => {
      tokens.push(new Headers(init?.headers).get('Authorization') ?? '');
      const next = responses.shift();
      if (next === undefined) throw new Error('No more responses.');
      return next;
    },
  });
  return { client, tokens };
};

describe('IGDB client', () => {
  it('retries once with a new token after a 401', async () => {
    const { client, tokens } = setup([new Response(null, { status: 401 }), Response.json([])]);

    await expect(client.searchGames('witcher', 10)).resolves.toEqual([]);
    expect(tokens).toEqual(['Bearer token-0', 'Bearer token-1']);
  });

  // The service turns every one of these into cached results marked stale.
  it.each([
    { status: 429, failure: 'rate-limited' },
    { status: 500, failure: 'unavailable' },
    { status: 401, failure: 'unavailable' },
  ])('reports $status as $failure', async ({ status, failure }) => {
    const { client } = setup([new Response(null, { status }), new Response(null, { status })]);

    await expect(client.getGenres()).rejects.toEqual(
      new IgdbError(failure as IgdbError['failure']),
    );
  });
});
