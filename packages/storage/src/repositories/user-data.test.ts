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
import { putRows } from '../testing/rows';
import { listEntryTags, listTagsInUse } from './entry-tags';
import { listGamesOf, listItemsOf } from './lists';
import { countOpenNotes, listNoteItems } from './note-items';
import { SYNCED_ROWS } from './synced-rows';

const NOW = '2026-09-18T10:00:00Z';
const ENTRY_ID = 'entry-1942';

const tagFor = (entryId: string, raw: string) =>
  createEntryTag({ id: tagIdentityKey(entryId, raw), entryId, tag: raw });

const entry = createEntry(
  { id: ENTRY_ID, gameId: 1942, status: 'playing', createdAt: NOW },
  { today: '2026-09-18' },
);

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
    await putRows(adapter, SYNCED_ROWS.library_entries, [entry], { now: NOW });
  });

  describe('tags', () => {
    it('lists live tags, and counts them for a filter list ignoring archived games', async () => {
      const coOp = tagFor(ENTRY_ID, 'co-op');
      await putRows(adapter, SYNCED_ROWS.entry_tags, [coOp], { now: NOW });
      await putRows(adapter, SYNCED_ROWS.entry_tags, [tagFor(ENTRY_ID, 'rpg')], {
        now: NOW,
        deleted: true,
      });

      expect(await listEntryTags(adapter, ENTRY_ID)).toEqual([coOp]);
      expect(await listTagsInUse(adapter)).toEqual([{ tag: 'co-op', count: 1 }]);

      await putRows(adapter, SYNCED_ROWS.library_entries, [{ ...entry, archived: true }], {
        now: NOW,
      });
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

    it('lists live notes, filtered by type, in reading order', async () => {
      await putRows(
        adapter,
        SYNCED_ROWS.note_items,
        [
          noteFor('a', { location: 'Chapter 2' }),
          noteFor('b', { location: 'Chapter 1', type: 'npc_hint' }),
          noteFor('c', { resolved: true }),
        ],
        { now: NOW },
      );
      await putRows(adapter, SYNCED_ROWS.note_items, [noteFor('d')], { now: NOW, deleted: true });

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
  });

  describe('lists', () => {
    const list = createList({ id: 'list-1', name: 'Best of 2026', createdAt: NOW });
    const item = createListItem({ id: 'i-1', listId: 'list-1', gameId: 1942, addedAt: NOW });

    it('holds catalog games in the order added, leaving out uncached ones', async () => {
      await putRows(adapter, SYNCED_ROWS.lists, [list], { now: NOW });
      await putRows(
        adapter,
        SYNCED_ROWS.list_items,
        [item, createListItem({ id: 'i-2', listId: 'list-1', gameId: 404, addedAt: NOW })],
        { now: NOW },
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
      await putRows(adapter, SYNCED_ROWS.lists, [list], { now: NOW, deleted: true });
      await putRows(adapter, SYNCED_ROWS.list_items, [item], { now: NOW });
      expect(await listItemsOf(adapter, 'list-1')).toEqual([]);
      expect(await listGamesOf(adapter, 'list-1')).toEqual([]);

      // What applying a newer edit from another device does to the list row.
      await adapter.execute('UPDATE lists SET deleted = 0 WHERE id = ?', ['list-1']);
      expect(await listItemsOf(adapter, 'list-1')).toHaveLength(1);
    });
  });
});
