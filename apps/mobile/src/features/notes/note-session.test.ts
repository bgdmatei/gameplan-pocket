import { webcrypto } from 'node:crypto';
import { DomainValidationError } from '@gameplan/domain';
import { listPendingOps, upsertGames } from '@gameplan/storage';
import type { StorageAdapter } from '@gameplan/storage';
import { createMigratedNodeAdapter } from '@gameplan/storage/node';
import { entryId } from '@gameplan/sync';
import type { SyncEnv } from '@gameplan/sync';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addGame } from '../library/add-game';
import { createNote, deleteNote, openNoteSession } from './note-session';

let clock = Date.UTC(2026, 8, 29, 18);
const env: SyncEnv = {
  // Every call moves on a second, so each op gets a clock of its own.
  now: () => (clock += 1_000),
  randomBytes: (length) => webcrypto.getRandomValues(new Uint8Array(length)),
};

const ENTRY = entryId(113112);

const setUp = async (): Promise<StorageAdapter> => {
  const adapter = await createMigratedNodeAdapter();
  await upsertGames(adapter, {
    games: [
      {
        id: 113112,
        name: 'Hades',
        slug: 'hades',
        summary: null,
        firstReleaseDate: null,
        coverImageId: null,
        genreIds: [],
        platformIds: [],
      },
    ],
    fetchedAt: '2026-09-29T18:00:00Z',
  });
  await addGame(adapter, env, { gameId: 113112, status: 'playing', today: '2026-09-29' });
  return adapter;
};

const opsFor = async (adapter: StorageAdapter, id: string) =>
  (await listPendingOps(adapter, { limit: 100 }))
    .map(
      (pending) =>
        JSON.parse(pending.payload) as { entityId: string; hlc: string; baseHlc?: string },
    )
    .filter((op) => op.entityId === id);

describe('a note editing session', () => {
  let adapter: StorageAdapter;

  beforeEach(async () => {
    adapter = await setUp();
  });

  // ADR-009: the base is the text the user started from. Re-reading it after
  // the first save would make the second look based on the session's own edit.
  it('sends the clock from when it opened with every save, not the one after the last', async () => {
    const id = await createNote(adapter, env, { entryId: ENTRY, type: 'puzzle', text: 'Draft' });
    const [created] = await opsFor(adapter, id);

    const session = await openNoteSession(adapter, env, id);
    await session.save({ text: 'Draft, longer' });
    await session.save({ text: 'Draft, longer still' });

    const [, first, second] = await opsFor(adapter, id);
    expect(first?.baseHlc).toBe(created?.hlc);
    expect(second?.baseHlc).toBe(created?.hlc);
  });
});

// Attack (CLAUDE.md §Privacy): note text and location never reach a log line
// or a toast, which would hand them to whoever reads the device logs.
describe('note privacy', () => {
  const MARKER = 'zq-private-marker-7731';
  const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the text and location out of console output and rejection messages', async () => {
    const spies = methods.map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
    const adapter = await setUp();

    const id = await createNote(adapter, env, {
      entryId: ENTRY,
      type: 'secret',
      text: `Chest code ${MARKER}`,
      location: `Tartarus ${MARKER}`,
    });
    const session = await openNoteSession(adapter, env, id);
    await session.save({ text: `Chest code is 1234 ${MARKER}`, resolved: true });
    await deleteNote(adapter, env, id);

    // Too long in both fields: the toast lists the reasons, not the values.
    const other = await createNote(adapter, env, { entryId: ENTRY, type: 'other', text: 'Short' });
    const rejected = await (
      await openNoteSession(adapter, env, other)
    )
      .save({ text: MARKER.repeat(500), location: MARKER.repeat(20) })
      .catch((error: unknown) => error);

    expect(rejected).toBeInstanceOf(DomainValidationError);
    const shown = rejected instanceof DomainValidationError ? rejected.messages : [];
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.join(' ')).not.toContain(MARKER);

    // Serialised, not String(): a logged patch object would read as "[object Object]".
    const logged = JSON.stringify(spies.map((spy) => spy.mock.calls));
    expect(logged).not.toContain(MARKER);
  });
});
