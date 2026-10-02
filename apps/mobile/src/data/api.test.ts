import { HEADERS, PROTOCOL_VERSION } from '@gameplan/contracts';
import type { Game } from '@gameplan/domain';
import { describe, expect, it } from 'vitest';
import { createCatalogApi } from './api';

const GAME: Game = {
  id: 1942,
  name: 'The Witcher 3: Wild Hunt',
  slug: 'the-witcher-3-wild-hunt',
  summary: null,
  firstReleaseDate: '2015-05-19',
  coverImageId: 'co1wyy',
  genreIds: [12],
  platformIds: [6],
};

const answering = (respond: (request: Request) => Response | Promise<Response>) => {
  const seen: Request[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    seen.push(request);
    return respond(request);
  };
  const api = createCatalogApi({
    baseUrl: 'https://api.test',
    apiKey: 'key-0123456789abcdef',
    appVersion: '1.2.3',
    fetch,
  });
  return { api, seen };
};

describe('catalog API client', () => {
  // What reaches the phone decides what gets cached; nothing the server (or
  // something in between) sends may break a screen or land in SQLite unchecked.
  it.each([
    {
      case: 'a good answer',
      respond: () => Response.json({ games: [GAME], stale: false }),
      expected: { kind: 'ok', value: [GAME], stale: false },
    },
    {
      case: 'a stale answer, passed through',
      respond: () => Response.json({ games: [GAME], stale: true }),
      expected: { kind: 'ok', value: [GAME], stale: true },
    },
    {
      case: 'extra fields from a newer server, dropped',
      respond: () =>
        Response.json({ games: [{ ...GAME, rank: 1 }], stale: false, catalogVersion: 9 }),
      expected: { kind: 'ok', value: [GAME], stale: false },
    },
    {
      case: 'wrong types',
      respond: () => Response.json({ games: [{ ...GAME, id: 'one' }], stale: false }),
      expected: { kind: 'failed' },
    },
    {
      case: 'a body that is not JSON',
      respond: () => new Response('<html>Bad gateway</html>', { status: 200 }),
      expected: { kind: 'failed' },
    },
    {
      case: 'a 10 MB body',
      respond: () => new Response(`{"games":[],"stale":false,"pad":"${'x'.repeat(10_000_000)}"}`),
      expected: { kind: 'failed' },
    },
    {
      case: 'a refused key',
      respond: () => Response.json({ error: 'unauthorized' }, { status: 401 }),
      expected: { kind: 'failed' },
    },
    {
      case: 'no network',
      respond: () => Promise.reject(new TypeError('Network request failed')),
      expected: { kind: 'offline' },
    },
  ])('turns $case into a result', async ({ respond, expected }) => {
    const { api } = answering(respond);
    expect(await api.search('witcher')).toEqual(expected);
  });

  it('sends the key, the app version and the protocol version', async () => {
    const { api, seen } = answering(() => Response.json({ games: [], stale: false }));

    await api.search('witcher 3');

    const [request] = seen;
    expect(request?.url).toBe('https://api.test/catalog/search?q=witcher+3');
    expect(request?.headers.get(HEADERS.apiKey)).toBe('key-0123456789abcdef');
    expect(request?.headers.get(HEADERS.appVersion)).toBe('1.2.3');
    expect(request?.headers.get(HEADERS.protocolVersion)).toBe(String(PROTOCOL_VERSION));
  });

  // Typing aborts the previous search; that is not a failure to show.
  it('reports an aborted request as superseded', async () => {
    const controller = new AbortController();
    const { api } = answering(
      (request) =>
        new Promise((_resolve, reject) => {
          request.signal.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );

    const pending = api.search('witcher', { signal: controller.signal });
    controller.abort();

    expect(await pending).toEqual({ kind: 'superseded' });
  });
});
