import { webcrypto } from 'node:crypto';
import type { VerifyResponse } from '@gameplan/contracts';
import { createEntry } from '@gameplan/domain';
import { getSyncState, updateSyncState } from '@gameplan/storage';
import type { StorageAdapter } from '@gameplan/storage';
import { createMigratedNodeAdapter } from '@gameplan/storage/node';
import { commitLocalCreate, entryId } from '@gameplan/sync';
import type { SyncEnv } from '@gameplan/sync';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthResult } from '@/data/auth-api';
import type { Session } from './session';
import { signIn } from './sign-in';

const env: SyncEnv = {
  now: () => Date.parse('2026-10-14T12:00:00.000Z'),
  randomBytes: (length) => webcrypto.getRandomValues(new Uint8Array(length)),
};

const OWNER = '0b7a4c1e-7f4e-4c55-9d1a-2f0f3b6d8e10';
const OTHER = '9d3e1f2a-4b5c-4d6e-8f70-1a2b3c4d5e6f';

const answerFor = (userId: string): VerifyResponse => ({
  accessToken: 'access',
  refreshToken: `refresh-${userId}`,
  accessExpiresAt: '2026-10-14T12:15:00.000Z',
  user: { id: userId, email: 'player@example.com' },
  device: { id: '6f1c2b8a-3d4e-4f5a-8b9c-0d1e2f3a4b5c' },
});

describe('signIn', () => {
  let adapter: StorageAdapter;

  beforeEach(async () => {
    adapter = await createMigratedNodeAdapter();
    // A library with one game in it, to prove it is never touched.
    await commitLocalCreate(adapter, env, {
      entity: 'library_entry',
      next: createEntry(
        { id: entryId(1942), gameId: 1942, status: 'playing', createdAt: '2026-10-14T10:00:00Z' },
        { today: '2026-10-14' },
      ),
    });
  });

  const attempt = async (owner: string | null, answer: AuthResult<VerifyResponse>) => {
    if (owner !== null) await updateSyncState(adapter, { ownerUserId: owner });
    const started: Session[] = [];
    const loggedOut: string[] = [];
    const sentNodeIds: string[] = [];
    const sentOwners: (string | undefined)[] = [];
    const result = await signIn(
      {
        adapter,
        randomBytes: env.randomBytes,
        platform: 'ios',
        appVersion: '1.0.0',
        session: { start: async (session) => void started.push(session) },
        api: {
          verify: async ({ device, ownerUserId }) => {
            sentNodeIds.push(device.nodeId);
            sentOwners.push(ownerUserId);
            return answer;
          },
          logout: async (token) => {
            loggedOut.push(token);
            return { kind: 'ok', value: undefined };
          },
        },
      },
      { email: 'player@example.com', code: '123456' },
    );
    const state = await getSyncState(adapter);
    const [{ games } = { games: -1 }] = await adapter.execute<{ games: number }>(
      'SELECT count(*) AS games FROM library_entries',
    );
    return { result, started, loggedOut, sentNodeIds, sentOwners, state, games };
  };

  // Decision 3 and 6: who owns the library decides; attack 14 is the last two.
  it.each([
    {
      case: 'no owner yet: the library becomes theirs',
      owner: null,
      answer: { kind: 'ok', value: answerFor(OWNER) },
      result: 'signed_in',
      ownerAfter: OWNER,
    },
    {
      case: 'the owner signing back in keeps it',
      owner: OWNER,
      answer: { kind: 'ok', value: answerFor(OWNER) },
      result: 'signed_in',
      ownerAfter: OWNER,
    },
    {
      case: 'another account, refused by the server for the library',
      owner: OWNER,
      answer: { kind: 'library_owner_mismatch' },
      result: 'library_belongs_to_other',
      ownerAfter: OWNER,
    },
    {
      case: 'another account, refused by the server for the node id',
      owner: OWNER,
      answer: { kind: 'device_conflict' },
      result: 'library_belongs_to_other',
      ownerAfter: OWNER,
    },
    {
      case: 'another account the server let through',
      owner: OWNER,
      answer: { kind: 'ok', value: answerFor(OTHER) },
      result: 'library_belongs_to_other',
      ownerAfter: OWNER,
    },
  ] as const)('$case', async ({ owner, answer, result, ownerAfter }) => {
    const outcome = await attempt(owner, answer);

    expect(outcome.result.kind).toBe(result);
    expect(outcome.state.ownerUserId).toBe(ownerAfter);
    expect(outcome.games).toBe(1);
    // The phone registers the node id its edits already carry.
    expect(outcome.sentNodeIds).toEqual([outcome.state.nodeId]);
    // And names the library's owner, so the server refuses anyone else.
    expect(outcome.sentOwners).toEqual([owner ?? undefined]);
    if (result === 'signed_in') {
      expect(outcome.started).toHaveLength(1);
    } else {
      // Nothing of the other account is kept, and its tokens are revoked.
      expect(outcome.started).toEqual([]);
      if (answer.kind === 'ok') expect(outcome.loggedOut).toEqual([answer.value.refreshToken]);
    }
  });
});
