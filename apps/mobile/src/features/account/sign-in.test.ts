import type { VerifyResponse } from '@gameplan/contracts';
import { getSyncState, updateSyncState } from '@gameplan/storage';
import type { StorageAdapter } from '@gameplan/storage';
import { createMigratedNodeAdapter } from '@gameplan/storage/node';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthResult } from '@/data/auth-api';
import type { Session } from './session';
import { signIn } from './sign-in';
import { PLAYER_ID, playerSession, seedOneGame, testEnv } from './test-fixtures';

const OWNER = PLAYER_ID;
const OTHER = '9d3e1f2a-4b5c-4d6e-8f70-1a2b3c4d5e6f';

const answerFor = (userId: string): VerifyResponse => {
  const session = playerSession({ refreshToken: `refresh-${userId}` });
  return { ...session, user: { ...session.user, id: userId } };
};

describe('signIn', () => {
  let adapter: StorageAdapter;

  beforeEach(async () => {
    adapter = await createMigratedNodeAdapter();
    await seedOneGame(adapter);
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
        randomBytes: testEnv.randomBytes,
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
      revoked: [],
    },
    {
      case: 'the owner signing back in keeps it',
      owner: OWNER,
      answer: { kind: 'ok', value: answerFor(OWNER) },
      result: 'signed_in',
      ownerAfter: OWNER,
      revoked: [],
    },
    {
      case: 'another account, refused by the server for the library',
      owner: OWNER,
      answer: { kind: 'library_owner_mismatch' },
      result: 'library_belongs_to_other',
      ownerAfter: OWNER,
      revoked: [],
    },
    {
      case: 'another account, refused by the server for the node id',
      owner: OWNER,
      answer: { kind: 'device_conflict' },
      result: 'library_belongs_to_other',
      ownerAfter: OWNER,
      revoked: [],
    },
    {
      case: 'another account the server let through',
      owner: OWNER,
      answer: { kind: 'ok', value: answerFor(OTHER) },
      result: 'library_belongs_to_other',
      ownerAfter: OWNER,
      // Tokens for the wrong account are revoked, never kept.
      revoked: [`refresh-${OTHER}`],
    },
  ] as const)('$case', async ({ owner, answer, result, ownerAfter, revoked }) => {
    const outcome = await attempt(owner, answer);

    expect(outcome.result.kind).toBe(result);
    expect(outcome.state.ownerUserId).toBe(ownerAfter);
    expect(outcome.games).toBe(1);
    // The phone registers the node id its edits already carry.
    expect(outcome.sentNodeIds).toEqual([outcome.state.nodeId]);
    // And names the library's owner, so the server refuses anyone else.
    expect(outcome.sentOwners).toEqual([owner ?? undefined]);
    expect(outcome.started).toHaveLength(result === 'signed_in' ? 1 : 0);
    // The logout is fire-and-forget: let it run before counting it.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(outcome.loggedOut).toEqual(revoked);
  });
});
