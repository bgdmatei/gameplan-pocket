import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SyncAuth } from './sync-api';
import { createSyncEvents, type StreamingFetch } from './sync-events';

const SSE = { 'content-type': 'text/event-stream' };

/** A stream the test writes to, as the server would. */
const serverStream = () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start: (c) => {
      controller = c;
    },
  });
  const send = (text: string) => controller.enqueue(new TextEncoder().encode(text));
  return { body, send };
};

/** A phone whose refresh hands out `access-2`, talking to `respond`. */
const phone = (
  respond: (token: string | null, signal: AbortSignal) => ReturnType<StreamingFetch>,
) => {
  const tokens: (string | null)[] = [];
  const ended: string[] = [];
  const auth: SyncAuth = {
    accessToken: async () => ({ kind: 'ok', token: 'access-1' }),
    rejected: async () => ({ kind: 'ok', token: 'access-2' }),
    end: async () => {
      ended.push('end');
    },
  };
  const events = createSyncEvents({
    baseUrl: 'https://api.test',
    appVersion: '1.2.3',
    auth,
    fetch: async (_url, { headers, signal }) => {
      const token = headers.Authorization?.replace('Bearer ', '') ?? null;
      tokens.push(token);
      return respond(token, signal);
    },
  });
  return { events, tokens, ended };
};

const answer = (
  status: number,
  headers: Record<string, string> = {},
  body: ReadableStream<Uint8Array> = new ReadableStream(),
) => Promise.resolve({ status, headers: new Headers(headers), body });

const closed = () => new ReadableStream<Uint8Array>({ start: (c) => c.close() });

afterEach(() => {
  vi.useRealTimers();
});

describe('sync events stream', () => {
  it('refreshes once on a 401, then delivers pokes and drops one off contract', async () => {
    const server = serverStream();
    const { events, tokens } = phone((token) =>
      token === 'access-2' ? answer(200, SSE, server.body) : answer(401),
    );
    const pokes: number[] = [];
    let twoPokes!: () => void;
    const delivered = new Promise<void>((resolve) => {
      twoPokes = resolve;
    });
    const stop = new AbortController();

    const ended = events.open((seq) => {
      pokes.push(seq);
      if (pokes.length === 2) twoPokes();
    }, stop.signal);
    server.send('event: poke\ndata: {"seq":3}\n\n:\n\n');
    server.send('event: poke\ndata: {"seq":4,"op":"x"}\n\nevent: poke\nda');
    server.send('ta: {"seq":5}\n\n');
    await delivered;
    stop.abort();

    expect(await ended).toBe('stopped');
    expect(pokes).toEqual([3, 5]);
    expect(tokens).toEqual(['access-1', 'access-2']);
  });

  it('ends the session when the fresh token is refused too', async () => {
    const { events, tokens, ended } = phone(() => answer(401));

    expect(await events.open(() => undefined, new AbortController().signal)).toBe('ended');
    expect(tokens).toEqual(['access-1', 'access-2']);
    expect(ended).toEqual(['end']);
  });

  // The OS doesn't always report a dead connection; the heartbeat comes every 25 s.
  it('closes a stream silent for 60 s as offline', async () => {
    vi.useFakeTimers();
    const server = serverStream();
    const { events } = phone(() => answer(200, SSE, server.body));
    let result: string | undefined;

    void events
      .open(() => undefined, new AbortController().signal)
      .then((r) => {
        result = r;
      });
    await vi.advanceTimersByTimeAsync(30_000);
    server.send(':\n\n');
    await vi.advanceTimersByTimeAsync(59_000);
    expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(result).toBe('offline');
  });

  it('gives up as offline on a request held open with no answer for 60 s', async () => {
    vi.useFakeTimers();
    const { events } = phone(
      (_token, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const ended = events.open(() => undefined, new AbortController().signal);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(await ended).toBe('offline');
  });

  it.each([
    { case: 'a 426', respond: () => answer(426), kind: 'update_required' },
    { case: 'a 503', respond: () => answer(503), kind: 'offline' },
    {
      case: 'no network',
      respond: () => Promise.reject(new TypeError('Network')),
      kind: 'offline',
    },
    { case: 'the server closing it', respond: () => answer(200, SSE, closed()), kind: 'offline' },
    {
      case: 'a 200 page, not a stream',
      respond: () => answer(200, { 'content-type': 'text/html' }),
      kind: 'failed',
    },
  ])('ends as $kind on $case', async ({ respond, kind }) => {
    const { events } = phone(respond);

    expect(await events.open(() => undefined, new AbortController().signal)).toBe(kind);
  });
});
