import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { HEADERS, pokeSchema } from '@gameplan/contracts';
import { serve } from '@hono/node-server';
import type { ServerType } from '@hono/node-server';
import type { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ACCESS_TOKEN_TTL_MS } from '../../auth/tokens';
import { createTestApp } from '../../testing/auth';
import type { TestAuth } from '../../testing/auth';
import { createSyncTestKit } from '../../testing/sync';
import type { SyncTestKit } from '../../testing/sync';
import type { PokeHub } from './hub';
import { createPokeListener } from './listener';
import type { PokeListener } from './listener';

const POKE = /event: poke\ndata: (.*)\n\n/g;

describe('GET /sync/events', () => {
  let t: TestAuth & { app: Hono; dbUrl: string; pokes: PokeHub };
  let kit: SyncTestKit;
  let listener: PokeListener;
  let server: ServerType;
  let origin: string;
  const streams: { close: () => Promise<void> }[] = [];

  beforeAll(async () => {
    t = await createTestApp();
    kit = createSyncTestKit(t);
    listener = createPokeListener({
      connectionString: t.dbUrl,
      hub: t.pokes,
      logger: { warn: () => undefined },
    });
    await listener.start();
    // A real server, not app.request: node-server could buffer a stream that Hono doesn't.
    server = await new Promise<ServerType>((resolve) => {
      const started = serve({ fetch: t.app.fetch, port: 0 }, () => resolve(started));
    });
    origin = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await Promise.all(streams.map((stream) => stream.close()));
    await listener.stop();
    server.close();
  });

  const open = async (headers: Record<string, string>) => {
    const response = await fetch(`${origin}/sync/events`, { headers });
    if (response.body === null) throw new Error('no body');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    let ended = false;
    void (async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          ended = true;
          return;
        }
        text += decoder.decode(value, { stream: true });
      }
    })();
    const stream = {
      status: response.status,
      text: () => text,
      ended: () => ended,
      pokes: () =>
        [...text.matchAll(POKE)].map((match) => pokeSchema.parse(JSON.parse(match[1] ?? '')).seq),
      close: () => reader.cancel(),
    };
    streams.push(stream);
    return stream;
  };

  const twoDevices = async () => {
    const {
      tokens: [one = '', two = ''],
    } = await kit.devices(2);
    return { one, two };
  };

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  it("opens on the account's current position, then pokes on another device's push", async () => {
    const { one, two } = await twoDevices();
    await kit.push(one, [kit.setOp('list', 'l-1', { name: 'Co-op' })]);

    const stream = await open(bearer(two));
    expect(stream.status).toBe(200);
    await vi.waitFor(() => expect(stream.pokes()).toEqual([1]));

    await kit.push(one, [kit.setOp('list', 'l-2', { name: 'RPG' })]);
    await vi.waitFor(() => expect(stream.pokes()).toEqual([1, 2]));
  });

  it('closes a stream when its token expires, and refuses that token after', async () => {
    const { two } = await twoDevices();
    t.clock.advance(ACCESS_TOKEN_TTL_MS - 1_000);

    const stream = await open(bearer(two));
    expect(stream.status).toBe(200);
    await vi.waitFor(() => expect(stream.ended()).toBe(true), { timeout: 3_000 });

    t.clock.advance(1_000);
    expect((await open(bearer(two))).status).toBe(401);
  });

  it("ends a device's older stream when it opens a new one", async () => {
    const { one, two } = await twoDevices();
    const older = await open(bearer(two));
    await vi.waitFor(() => expect(older.pokes()).toEqual([0]));

    const newer = await open(bearer(two));
    await vi.waitFor(() => expect(older.ended()).toBe(true));

    await kit.push(one, [kit.setOp('list', 'l-1', { name: 'Co-op' })]);
    await vi.waitFor(() => expect(newer.pokes()).toEqual([0, 1]));
    expect(newer.ended()).toBe(false);
  });

  it('refuses a missing or forged token, and an app below the served protocol', async () => {
    const { one } = await twoDevices();
    const [signature] = one.split('.').reverse();

    expect((await open({})).status).toBe(401);
    expect((await open(bearer(one.replace(signature ?? '', 'x'.repeat(43))))).status).toBe(401);
    expect((await open({ ...bearer(one), [HEADERS.protocolVersion]: '0' })).status).toBe(426);
  });

  // A poke is a position, never data: note text must not reach the stream.
  it('carries nothing but pokes and heartbeats after a note is pushed', async () => {
    const { one, two } = await twoDevices();
    const stream = await open(bearer(two));
    await vi.waitFor(() => expect(stream.pokes()).toEqual([0]));
    const note = kit.setOp('note_item', randomUUID(), {
      entryId: 'entry-1',
      type: 'puzzle',
      text: 'The lever behind the waterfall opens the vault',
      location: 'Old mill',
      resolved: false,
      createdAt: '2026-11-19T10:00:00.000Z',
    });

    const { accepted } = await kit.push(one, [note]);
    expect(accepted).toEqual([note.id]);

    await vi.waitFor(() => expect(stream.pokes()).toEqual([0, 1]));
    expect(stream.text()).toMatch(/^(?::\n\n|event: poke\ndata: \{"seq":\d+\}\n\n)+$/);
  });
});
