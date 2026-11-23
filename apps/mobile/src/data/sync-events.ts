import { HEADERS, POKE_EVENT, PROTOCOL_VERSION, pokeSchema } from '@gameplan/contracts';
import { createSseParser } from './sse';
import type { SyncAuth, SyncFailure } from './sync-api';

/** No bytes for this long, though the server sends a heartbeat every 25 s: the connection is dead. */
const STALL_MS = 60_000;

/**
 * Global fetch in React Native hands over the body only once it has ended, so
 * the app passes `expo/fetch`, which streams it; tests pass a fake.
 */
export type StreamingFetch = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<{
  status: number;
  headers: { get: (name: string) => string | null };
  body: ReadableStream<Uint8Array> | null;
}>;

/** How a stream ended: a sync failure kind, or `stopped` by the caller's signal. */
export type SyncEventsEnd = SyncFailure | 'stopped';

export type SyncEventsConfig = {
  baseUrl: string;
  appVersion: string;
  auth: SyncAuth;
  fetch: StreamingFetch;
  stallMs?: number;
};

type StreamResponse = Awaited<ReturnType<StreamingFetch>>;

const parsePoke = (data: string): number | null => {
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    return null;
  }
  const poke = pokeSchema.safeParse(json);
  return poke.success ? poke.data.seq : null;
};

const refusal = ({ status, headers }: StreamResponse): SyncFailure | null => {
  if (status === 426) return 'update_required';
  if (status >= 500) return 'offline';
  if (status !== 200) return 'failed';
  // A captive portal answers 200 with a page that may never end a line.
  const type = (headers.get('content-type') ?? '').trim().toLowerCase();
  return type.startsWith('text/event-stream') ? null : 'failed';
};

/**
 * `GET /sync/events`: calls `onPoke` with each poke's `seq` until the stream
 * ends, and resolves with why. It rejects only if the session's own calls do.
 * A server that closes the stream (token expiry, a newer stream from this
 * device) ends it as `offline`, like a drop: the caller reconnects either way.
 */
export const createSyncEvents = ({
  baseUrl,
  appVersion,
  auth,
  fetch,
  stallMs = STALL_MS,
}: SyncEventsConfig) => {
  const read = async (
    body: ReadableStream<Uint8Array>,
    connection: AbortController,
    signal: AbortSignal,
    onPoke: (seq: number) => void,
  ): Promise<SyncEventsEnd> => {
    const reader = body.getReader();
    const parser = createSseParser();
    let ended: SyncEventsEnd = 'offline';
    const cut = (why: SyncEventsEnd) => {
      ended = why;
      connection.abort();
      void reader.cancel().catch(() => undefined);
    };
    let stall = setTimeout(() => cut('offline'), stallMs);
    const stop = () => cut('stopped');
    signal.addEventListener('abort', stop);
    if (signal.aborted) stop();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return ended;
        clearTimeout(stall);
        stall = setTimeout(() => cut('offline'), stallMs);
        for (const message of parser.push(value)) {
          if (message.type !== 'event' || message.event !== POKE_EVENT) continue;
          const seq = parsePoke(message.data);
          if (seq !== null) onPoke(seq);
        }
      }
    } catch {
      return ended;
    } finally {
      clearTimeout(stall);
      signal.removeEventListener('abort', stop);
      // Also after a throwing onPoke: an unread stream would still hold one of
      // the account's ten slots on the server.
      connection.abort();
    }
  };

  const connect = async (
    token: string,
    signal: AbortSignal,
  ): Promise<{ response: StreamResponse; connection: AbortController } | 'offline' | 'stopped'> => {
    if (signal.aborted) return 'stopped';
    const connection = new AbortController();
    const stop = () => connection.abort();
    signal.addEventListener('abort', stop);
    // Until the headers arrive: a stuck proxy can hold a request open forever.
    const stall = setTimeout(stop, stallMs);
    try {
      const response = await fetch(`${baseUrl}/sync/events`, {
        signal: connection.signal,
        headers: {
          [HEADERS.appVersion]: appVersion,
          [HEADERS.protocolVersion]: String(PROTOCOL_VERSION),
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
        },
      });
      return { response, connection };
    } catch {
      return signal.aborted ? 'stopped' : 'offline';
    } finally {
      clearTimeout(stall);
      signal.removeEventListener('abort', stop);
    }
  };

  const open = async (
    onPoke: (seq: number) => void,
    signal: AbortSignal,
  ): Promise<SyncEventsEnd> => {
    const first = await auth.accessToken();
    if (signal.aborted) return 'stopped';
    if (first.kind !== 'ok') return first.kind;
    let attempt = await connect(first.token, signal);
    if (typeof attempt === 'string') return attempt;
    if (attempt.response.status === 401) {
      attempt.connection.abort();
      const refreshed = await auth.rejected(first.token);
      if (signal.aborted) return 'stopped';
      if (refreshed.kind !== 'ok') return refreshed.kind;
      attempt = await connect(refreshed.token, signal);
      if (typeof attempt === 'string') return attempt;
      if (attempt.response.status === 401) {
        attempt.connection.abort();
        await auth.end();
        return 'ended';
      }
    }
    const { response, connection } = attempt;
    const failure = refusal(response);
    if (failure !== null || response.body === null) {
      connection.abort();
      return failure ?? 'failed';
    }
    return read(response.body, connection, signal, onPoke);
  };

  return { open };
};

export type SyncEvents = ReturnType<typeof createSyncEvents>;
