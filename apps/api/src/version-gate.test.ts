import { HEADERS } from '@gameplan/contracts';
import { describe, expect, it } from 'vitest';
import { TEST_API_KEY, createTestApp } from './testing/auth';
import { createSyncTestKit } from './testing/sync';

describe('the version gate', () => {
  it('tells an old app to update, a newer one to retry, and keeps auth open', async () => {
    const t = await createTestApp({ protocols: { min: 2, max: 2 } });
    const { token } = await createSyncTestKit(t).account();
    const send = (path: string, protocol: string, init: RequestInit = {}) =>
      t.app.request(path, {
        ...init,
        headers: {
          [HEADERS.protocolVersion]: protocol,
          [HEADERS.apiKey]: TEST_API_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
    const answer = async (response: Response | Promise<Response>) => {
      const settled = await response;
      return { status: settled.status, body: (await settled.json()) as unknown };
    };

    const updateRequired = { status: 426, body: { error: 'update_required' } };
    expect(await answer(send('/sync/pull?after=0', '1'))).toEqual(updateRequired);
    expect(await answer(send('/catalog/search?q=witcher', '1'))).toEqual(updateRequired);
    expect(await answer(send('/sync/pull?after=0', '3'))).toEqual({
      status: 400,
      body: { error: 'unsupported_protocol' },
    });
    expect(await answer(send('/sync/pull?after=0', 'two'))).toMatchObject({ status: 400 });
    expect((await send('/sync/pull?after=0', '2')).status).toBe(200);
    expect((await send('/me', '1')).status).toBe(200);
  });
});
