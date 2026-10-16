import { createEntry } from '@gameplan/domain';
import { createMigratedNodeAdapter } from '@gameplan/storage/node';
import { describe, expect, it } from 'vitest';
import { parseHlc } from '../clock/hlc';
import { entryId } from '../ids';
import { fakeEnv } from '../testing/env';
import { commitLocalCreate } from './commit';
import { ensureNodeId } from './node-id';

describe('ensureNodeId', () => {
  // Sign-in registers this id with the server before the phone has edited
  // anything. If later edits were stamped with a different one, the server
  // would hold a device that never sends ops and refuse the ops that come.
  it('gives sign-in the same id every later edit is stamped with', async () => {
    const adapter = await createMigratedNodeAdapter();
    const env = fakeEnv();

    const registered = await ensureNodeId(adapter, env.randomBytes);
    expect(await ensureNodeId(adapter, env.randomBytes)).toBe(registered);

    const op = await commitLocalCreate(adapter, env, {
      entity: 'library_entry',
      next: createEntry(
        {
          id: entryId(1942),
          gameId: 1942,
          status: 'playing',
          createdAt: '2026-10-14T10:00:00.000Z',
        },
        { today: '2026-10-14' },
      ),
    });
    expect(parseHlc(op.hlc).nodeId).toBe(registered);
  });
});
