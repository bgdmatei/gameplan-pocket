import { migrate } from '@gameplan/db-schema';
import {
  createEntry,
  createEntryTag,
  createList,
  createListItem,
  createNoteItem,
  tagIdentityKey,
} from '@gameplan/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StorageAdapter } from '../adapter';
import { createNodeAdapter } from '../node/adapter';
import { addEntryTag, listEntryTags, listTagsInUse, removeEntryTag } from './entry-tags';
import { getLibraryEntry, saveLibraryEntry } from './library-entries';
import { addGameToList, listGamesOf, listItemsOf, saveList, softDeleteList } from './lists';
import { countOpenNotes, listNoteItems, saveNoteItem, softDeleteNoteItem } from './note-items';

const NOW = '2026-09-18T10:00:00Z';
const ENTRY_ID = 'entry-1942';

const tagFor = (entryId: string, raw: string) =>
  createEntryTag({ id: tagIdentityKey(entryId, raw), entryId, tag: raw });

describe('user data', () => {
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
    it('keeps one row per tag however often it is added, and revives a removed one', async () => {
      const tag = tagFor(ENTRY_ID, 'co-op');
      await addEntryTag(adapter, tag, { createdAt: NOW });
      await addEntryTag(adapter, tagFor(ENTRY_ID, 'CO-OP'), { createdAt: NOW });
      expect(await listEntryTags(adapter, ENTRY_ID)).toHaveLength(1);

      await removeEntryTag(adapter, tag.id);
      expect(await listEntryTags(adapter, ENTRY_ID)).toEqual([]);

      await addEntryTag(adapter, tag, { createdAt: NOW });
      expect(await listEntryTags(adapter, ENTRY_ID)).toEqual([tag]);
    });

    it('counts tags in use for a filter list, ignoring archived games', async () => {
      await addEntryTag(adapter, tagFor(ENTRY_ID, 'co-op'), { createdAt: NOW });
      expect(await listTagsInUse(adapter)).toEqual([{ tag: 'co-op', count: 1 }]);

      const entry = await getLibraryEntry(adapter, ENTRY_ID);
      if (entry === null) throw new Error('The entry was not saved.');
      await saveLibraryEntry(adapter, { ...entry, archived: true }, { updatedAt: NOW });
      expect(await listTagsInUse(adapter)).toEqual([]);
    });
  });

  describe('notes', () => {
    const noteFor = (id: string, patch: Parameters<typeof createNoteItem>[0] | object = {}) =>
      createNoteItem({
        id,
        entryId: ENTRY_ID,
        createdAt: NOW,
        type: 'puzzle',
        text: `Note ${id}`,
        ...patch,
      });

    it('lists what is open, filtered by type, in reading order', async () => {
      await saveNoteItem(adapter, noteFor('a', { location: 'Chapter 2' }), { updatedAt: NOW });
      await saveNoteItem(adapter, noteFor('b', { location: 'Chapter 1', type: 'npc_hint' }), {
        updatedAt: NOW,
      });
      await saveNoteItem(adapter, noteFor('c', { resolved: true }), { updatedAt: NOW });

      expect((await listNoteItems(adapter, ENTRY_ID)).map((note) => note.id)).toEqual([
        'b',
        'a',
        'c',
      ]);
      expect(
        (await listNoteItems(adapter, ENTRY_ID, { resolved: false })).map((n) => n.id),
      ).toEqual(['b', 'a']);
      expect((await listNoteItems(adapter, ENTRY_ID, { type: 'puzzle' })).map((n) => n.id)).toEqual(
        ['a', 'c'],
      );
      expect(await countOpenNotes(adapter, ENTRY_ID)).toBe(2);
    });

    it('hides a deleted note and records the removal for other devices', async () => {
      await saveNoteItem(adapter, noteFor('a'), { updatedAt: NOW });

      await softDeleteNoteItem(adapter, 'a', {
        updatedAt: NOW,
        op: { id: 'op-1', payload: '{}', createdAt: NOW },
      });

      expect(await listNoteItems(adapter, ENTRY_ID)).toEqual([]);
      expect(await adapter.execute('SELECT id FROM pending_ops')).toEqual([{ id: 'op-1' }]);
    });
  });

  describe('lists', () => {
    const list = createList({ id: 'list-1', name: 'Best of 2026', createdAt: NOW });

    it('holds catalog games in the order added, leaving out uncached ones', async () => {
      await saveList(adapter, list, { updatedAt: NOW });
      await addGameToList(
        adapter,
        createListItem({ id: 'i-1', listId: 'list-1', gameId: 1942, addedAt: NOW }),
      );
      // Added twice: the shared id means one entry, not two.
      await addGameToList(
        adapter,
        createListItem({ id: 'i-1', listId: 'list-1', gameId: 1942, addedAt: NOW }),
      );
      await addGameToList(
        adapter,
        createListItem({ id: 'i-2', listId: 'list-1', gameId: 404, addedAt: NOW }),
      );

      expect(await listItemsOf(adapter, 'list-1')).toHaveLength(2);
      expect((await listGamesOf(adapter, 'list-1')).map((game) => game.name)).toEqual([
        'The Witcher 3',
      ]);
    });

    // Deletes never cascade: the items are hidden through their list, so a
    // list brought back by a later edit comes back with its games on every
    // device. A cascade once set `deleted` on the items with no op to undo it.
    it('hides the games of a deleted list, and shows them again if the list comes back', async () => {
      await saveList(adapter, list, { updatedAt: NOW });
      await addGameToList(
        adapter,
        createListItem({ id: 'i-1', listId: 'list-1', gameId: 1942, addedAt: NOW }),
      );

      await softDeleteList(adapter, 'list-1', { updatedAt: NOW });
      expect(await listItemsOf(adapter, 'list-1')).toEqual([]);
      expect(await listGamesOf(adapter, 'list-1')).toEqual([]);

      // What applying a newer edit from another device does to the list row.
      await adapter.execute('UPDATE lists SET deleted = 0 WHERE id = ?', ['list-1']);
      expect(await listItemsOf(adapter, 'list-1')).toHaveLength(1);
    });
  });
});
