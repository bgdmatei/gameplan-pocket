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
import { saveLibraryEntry, softDeleteLibraryEntry } from './library-entries';
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

    it('counts tags in use for a filter list, ignoring removed games', async () => {
      await addEntryTag(adapter, tagFor(ENTRY_ID, 'co-op'), { createdAt: NOW });
      expect(await listTagsInUse(adapter)).toEqual([{ tag: 'co-op', count: 1 }]);

      await softDeleteLibraryEntry(adapter, ENTRY_ID, { updatedAt: NOW });
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

  /**
   * One transaction, so another device can never receive the game's removal
   * without the notes and tags that belonged to it.
   */
  it('removing a game takes its tags and notes with it', async () => {
    await addEntryTag(adapter, tagFor(ENTRY_ID, 'co-op'), { createdAt: NOW });
    await saveNoteItem(
      adapter,
      createNoteItem({ id: 'n1', entryId: ENTRY_ID, createdAt: NOW, type: 'other', text: 'x' }),
      { updatedAt: NOW },
    );

    await softDeleteLibraryEntry(adapter, ENTRY_ID, { updatedAt: NOW });

    expect(await listEntryTags(adapter, ENTRY_ID)).toEqual([]);
    expect(await listNoteItems(adapter, ENTRY_ID)).toEqual([]);
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

    it('deleting a list takes its games with it', async () => {
      await saveList(adapter, list, { updatedAt: NOW });
      await addGameToList(
        adapter,
        createListItem({ id: 'i-1', listId: 'list-1', gameId: 1942, addedAt: NOW }),
      );

      await softDeleteList(adapter, 'list-1', { updatedAt: NOW });

      expect(await listItemsOf(adapter, 'list-1')).toEqual([]);
    });
  });
});
