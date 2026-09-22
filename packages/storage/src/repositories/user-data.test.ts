import { migrate } from '@gameplan/db-schema';
import {
  compareNoteItems,
  createEntry,
  createEntryTag,
  createList,
  createListItem,
  createNoteItem,
  tagIdentityKey,
} from '@gameplan/domain';
import type { NoteItem } from '@gameplan/domain';
import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StorageAdapter } from '../adapter';
import { createNodeAdapter } from '../node/adapter';
import { addEntryTag, listEntryTags, listTagsInUse, removeEntryTag } from './entry-tags';
import { saveLibraryEntry, softDeleteLibraryEntry } from './library-entries';
import {
  addGameToList,
  getList,
  listGamesOf,
  listItemsOf,
  listLists,
  removeGameFromList,
  saveList,
  softDeleteList,
} from './lists';
import {
  countOpenNotes,
  getNoteItem,
  listNoteItems,
  saveNoteItem,
  softDeleteNoteItem,
} from './note-items';

const NOW = '2026-09-18T10:00:00Z';
const ENTRY_ID = 'entry-1942';

/**
 * The domain's identity key doubles as the row id here. `sync-core` will hash
 * it into a UUID, but the key is plain printable text, so storing it directly
 * keeps these tests honest about the "same tag, one row" rule.
 */
const tagFor = (entryId: string, raw: string) =>
  createEntryTag({ id: tagIdentityKey(entryId, raw), entryId, tag: raw });

const noteFor = (id: string, patch: Partial<NoteItem> = {}): NoteItem => ({
  ...createNoteItem({
    id,
    entryId: ENTRY_ID,
    createdAt: NOW,
    type: 'puzzle',
    text: `Note ${id}`,
  }),
  ...patch,
});

describe('user data repositories', () => {
  let adapter: StorageAdapter;

  beforeEach(async () => {
    adapter = createNodeAdapter();
    await migrate(adapter);
    await adapter.execute('INSERT INTO games (id, name, slug, fetched_at) VALUES (?, ?, ?, ?)', [
      1942,
      'The Witcher 3',
      'the-witcher-3',
      NOW,
    ]);
    await saveLibraryEntry(
      adapter,
      createEntry(
        { id: ENTRY_ID, gameId: 1942, status: 'playing', createdAt: NOW },
        {
          today: '2026-09-18',
        },
      ),
      { updatedAt: NOW },
    );
  });

  describe('tags', () => {
    it('round-trips a tag', async () => {
      const tag = tagFor(ENTRY_ID, '  Co-Op  ');

      await addEntryTag(adapter, tag, { createdAt: NOW });

      expect(await listEntryTags(adapter, ENTRY_ID)).toEqual([tag]);
      expect((await listEntryTags(adapter, ENTRY_ID))[0]?.tag).toBe('co-op');
    });

    it('adding the same tag twice leaves one row', async () => {
      await addEntryTag(adapter, tagFor(ENTRY_ID, 'co-op'), { createdAt: NOW });
      await addEntryTag(adapter, tagFor(ENTRY_ID, 'CO-OP'), { createdAt: NOW });

      expect(await listEntryTags(adapter, ENTRY_ID)).toHaveLength(1);
    });

    it('re-adding a removed tag brings it back', async () => {
      const tag = tagFor(ENTRY_ID, 'co-op');
      await addEntryTag(adapter, tag, { createdAt: NOW });
      await removeEntryTag(adapter, tag.id);
      expect(await listEntryTags(adapter, ENTRY_ID)).toEqual([]);

      await addEntryTag(adapter, tag, { createdAt: NOW });

      expect(await listEntryTags(adapter, ENTRY_ID)).toEqual([tag]);
    });

    it('records a removal in the outbox', async () => {
      const tag = tagFor(ENTRY_ID, 'co-op');
      await addEntryTag(adapter, tag, { createdAt: NOW });

      await removeEntryTag(adapter, tag.id, {
        op: { id: 'op-1', payload: '{}', createdAt: NOW },
      });

      expect(await adapter.execute('SELECT id FROM pending_ops')).toEqual([{ id: 'op-1' }]);
    });

    it('lists tags alphabetically', async () => {
      for (const raw of ['rpg', 'co-op', 'backlog']) {
        await addEntryTag(adapter, tagFor(ENTRY_ID, raw), { createdAt: NOW });
      }

      expect((await listEntryTags(adapter, ENTRY_ID)).map((tag) => tag.tag)).toEqual([
        'backlog',
        'co-op',
        'rpg',
      ]);
    });

    it('counts how many games use each tag, most used first', async () => {
      await adapter.execute('INSERT INTO games (id, name, slug, fetched_at) VALUES (?, ?, ?, ?)', [
        2,
        'Celeste',
        'celeste',
        NOW,
      ]);
      await saveLibraryEntry(
        adapter,
        createEntry(
          { id: 'entry-2', gameId: 2, status: 'backlog', createdAt: NOW },
          {
            today: '2026-09-18',
          },
        ),
        { updatedAt: NOW },
      );
      await addEntryTag(adapter, tagFor(ENTRY_ID, 'co-op'), { createdAt: NOW });
      await addEntryTag(adapter, tagFor('entry-2', 'co-op'), { createdAt: NOW });
      await addEntryTag(adapter, tagFor('entry-2', 'rpg'), { createdAt: NOW });

      expect(await listTagsInUse(adapter)).toEqual([
        { tag: 'co-op', count: 2 },
        { tag: 'rpg', count: 1 },
      ]);
    });

    it('leaves out tags of a removed game', async () => {
      await addEntryTag(adapter, tagFor(ENTRY_ID, 'co-op'), { createdAt: NOW });

      await softDeleteLibraryEntry(adapter, ENTRY_ID, { updatedAt: NOW });

      expect(await listTagsInUse(adapter)).toEqual([]);
    });
  });

  describe('notes', () => {
    it('round-trips a note', async () => {
      const note = noteFor('note-1', { location: 'Chapter 2', type: 'secret' });

      await saveNoteItem(adapter, note, { updatedAt: NOW });

      expect(await getNoteItem(adapter, 'note-1')).toEqual(note);
    });

    it('lists notes by location, then oldest first, with location-less notes last', async () => {
      await saveNoteItem(adapter, noteFor('a', { location: 'Chapter 2', createdAt: NOW }), {
        updatedAt: NOW,
      });
      await saveNoteItem(
        adapter,
        noteFor('b', { location: 'Chapter 1', createdAt: '2026-09-19T10:00:00Z' }),
        { updatedAt: NOW },
      );
      await saveNoteItem(adapter, noteFor('c', { location: null }), { updatedAt: NOW });
      await saveNoteItem(
        adapter,
        noteFor('d', { location: 'Chapter 2', createdAt: '2026-09-17T10:00:00Z' }),
        { updatedAt: NOW },
      );

      expect((await listNoteItems(adapter, ENTRY_ID)).map((note) => note.id)).toEqual([
        'b',
        'd',
        'a',
        'c',
      ]);
    });

    it('filters by type and by what is still open', async () => {
      await saveNoteItem(adapter, noteFor('a', { type: 'puzzle', resolved: false }), {
        updatedAt: NOW,
      });
      await saveNoteItem(adapter, noteFor('b', { type: 'npc_hint', resolved: false }), {
        updatedAt: NOW,
      });
      await saveNoteItem(adapter, noteFor('c', { type: 'puzzle', resolved: true }), {
        updatedAt: NOW,
      });

      expect((await listNoteItems(adapter, ENTRY_ID, { type: 'puzzle' })).map((n) => n.id)).toEqual(
        ['a', 'c'],
      );
      expect(
        (await listNoteItems(adapter, ENTRY_ID, { resolved: false })).map((n) => n.id),
      ).toEqual(['a', 'b']);
      expect(
        (await listNoteItems(adapter, ENTRY_ID, { type: 'puzzle', resolved: true })).map(
          (n) => n.id,
        ),
      ).toEqual(['c']);
    });

    it('counts what is still open, for a badge on the library grid', async () => {
      await saveNoteItem(adapter, noteFor('a', { resolved: false }), { updatedAt: NOW });
      await saveNoteItem(adapter, noteFor('b', { resolved: true }), { updatedAt: NOW });

      expect(await countOpenNotes(adapter, ENTRY_ID)).toBe(1);
    });

    it('hides a deleted note and records the removal', async () => {
      await saveNoteItem(adapter, noteFor('a'), { updatedAt: NOW });

      await softDeleteNoteItem(adapter, 'a', {
        updatedAt: NOW,
        op: { id: 'op-1', payload: '{}', createdAt: NOW },
      });

      expect(await getNoteItem(adapter, 'a')).toBeNull();
      expect(await listNoteItems(adapter, ENTRY_ID)).toEqual([]);
      expect(await adapter.execute('SELECT id FROM pending_ops')).toEqual([{ id: 'op-1' }]);
    });
  });

  describe('deleting a game', () => {
    it('takes its tags and notes with it', async () => {
      await addEntryTag(adapter, tagFor(ENTRY_ID, 'co-op'), { createdAt: NOW });
      await saveNoteItem(adapter, noteFor('note-1'), { updatedAt: NOW });

      await softDeleteLibraryEntry(adapter, ENTRY_ID, { updatedAt: NOW });

      expect(await listEntryTags(adapter, ENTRY_ID)).toEqual([]);
      expect(await listNoteItems(adapter, ENTRY_ID)).toEqual([]);
    });

    it('leaves another game untouched', async () => {
      await adapter.execute('INSERT INTO games (id, name, slug, fetched_at) VALUES (?, ?, ?, ?)', [
        2,
        'Celeste',
        'celeste',
        NOW,
      ]);
      await saveLibraryEntry(
        adapter,
        createEntry(
          { id: 'entry-2', gameId: 2, status: 'backlog', createdAt: NOW },
          {
            today: '2026-09-18',
          },
        ),
        { updatedAt: NOW },
      );
      await addEntryTag(adapter, tagFor('entry-2', 'keep-me'), { createdAt: NOW });

      await softDeleteLibraryEntry(adapter, ENTRY_ID, { updatedAt: NOW });

      expect((await listEntryTags(adapter, 'entry-2')).map((tag) => tag.tag)).toEqual(['keep-me']);
    });
  });

  describe('lists', () => {
    const list = createList({ id: 'list-1', name: 'Best of 2026', createdAt: NOW });

    it('round-trips a list', async () => {
      await saveList(adapter, list, { updatedAt: NOW });

      expect(await getList(adapter, 'list-1')).toEqual(list);
      expect(await listLists(adapter)).toEqual([list]);
    });

    it('renames a list without adding a second one', async () => {
      await saveList(adapter, list, { updatedAt: NOW });

      await saveList(adapter, { ...list, name: 'Best of 2027' }, { updatedAt: NOW });

      expect(await listLists(adapter)).toHaveLength(1);
      expect((await getList(adapter, 'list-1'))?.name).toBe('Best of 2027');
    });

    it('holds any catalog game, in the order it was added', async () => {
      await adapter.execute('INSERT INTO games (id, name, slug, fetched_at) VALUES (?, ?, ?, ?)', [
        7,
        'Hades',
        'hades',
        NOW,
      ]);
      await saveList(adapter, list, { updatedAt: NOW });

      await addGameToList(
        adapter,
        createListItem({ id: 'i-1', listId: 'list-1', gameId: 7, addedAt: NOW }),
      );
      await addGameToList(
        adapter,
        createListItem({
          id: 'i-2',
          listId: 'list-1',
          gameId: 1942,
          addedAt: '2026-09-19T10:00:00Z',
        }),
      );

      expect((await listGamesOf(adapter, 'list-1')).map((game) => game.name)).toEqual([
        'Hades',
        'The Witcher 3',
      ]);
      expect(await listItemsOf(adapter, 'list-1')).toHaveLength(2);
    });

    it('adding the same game twice leaves one entry', async () => {
      await saveList(adapter, list, { updatedAt: NOW });
      const item = createListItem({ id: 'i-1', listId: 'list-1', gameId: 1942, addedAt: NOW });

      await addGameToList(adapter, item);
      await addGameToList(adapter, item);

      expect(await listItemsOf(adapter, 'list-1')).toHaveLength(1);
    });

    it('removes a game from a list', async () => {
      await saveList(adapter, list, { updatedAt: NOW });
      await addGameToList(
        adapter,
        createListItem({ id: 'i-1', listId: 'list-1', gameId: 1942, addedAt: NOW }),
      );

      await removeGameFromList(adapter, 'i-1', {
        op: { id: 'op-1', payload: '{}', createdAt: NOW },
      });

      expect(await listItemsOf(adapter, 'list-1')).toEqual([]);
      expect(await adapter.execute('SELECT id FROM pending_ops')).toEqual([{ id: 'op-1' }]);
    });

    it('deleting a list takes its games with it', async () => {
      await saveList(adapter, list, { updatedAt: NOW });
      await addGameToList(
        adapter,
        createListItem({ id: 'i-1', listId: 'list-1', gameId: 1942, addedAt: NOW }),
      );

      await softDeleteList(adapter, 'list-1', { updatedAt: NOW });

      expect(await getList(adapter, 'list-1')).toBeNull();
      expect(await listLists(adapter)).toEqual([]);
      expect(await listItemsOf(adapter, 'list-1')).toEqual([]);
    });

    it('records a deleted list in the outbox', async () => {
      await saveList(adapter, list, { updatedAt: NOW });

      await softDeleteList(adapter, 'list-1', {
        updatedAt: NOW,
        op: { id: 'op-1', payload: '{}', createdAt: NOW },
      });

      expect(await adapter.execute('SELECT id FROM pending_ops')).toEqual([{ id: 'op-1' }]);
    });

    it('leaves out a game the device has not cached', async () => {
      await saveList(adapter, list, { updatedAt: NOW });
      await addGameToList(
        adapter,
        createListItem({ id: 'i-1', listId: 'list-1', gameId: 404, addedAt: NOW }),
      );

      expect(await listGamesOf(adapter, 'list-1')).toEqual([]);
      expect(await listItemsOf(adapter, 'list-1')).toHaveLength(1);
    });
  });
});

describe('note ordering', () => {
  it('matches the domain comparator, so a database list reads like a sorted one', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            location: fc.option(fc.constantFrom('Chapter 1', 'Chapter 2', 'Swamp'), { nil: null }),
            createdAt: fc.constantFrom(
              '2026-09-17T10:00:00Z',
              '2026-09-18T10:00:00Z',
              '2026-09-19T10:00:00Z',
            ),
          }),
          { minLength: 1, maxLength: 12 },
        ),
        async (specs) => {
          const adapter = createNodeAdapter();
          try {
            await migrate(adapter);
            const notes = specs.map((spec) =>
              noteFor(spec.id, { location: spec.location, createdAt: spec.createdAt }),
            );
            for (const note of notes) {
              await saveNoteItem(adapter, note, { updatedAt: NOW });
            }

            const fromDatabase = (await listNoteItems(adapter, ENTRY_ID)).map((note) => note.id);
            const sortedInMemory = [...notes].sort(compareNoteItems).map((note) => note.id);

            // Ties are broken differently in SQL and in memory, so compare the
            // ordering keys rather than the ids themselves.
            const keyOf = (id: string) => {
              const note = notes.find((candidate) => candidate.id === id);
              return `${note?.location ?? '~'}|${note?.createdAt ?? ''}`;
            };
            expect(fromDatabase.map(keyOf)).toEqual(sortedInMemory.map(keyOf));
          } finally {
            await adapter.close();
          }
        },
      ),
      { numRuns: 20 },
    );
  });
});
