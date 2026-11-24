import {
  entryTagSchema,
  libraryEntrySchema,
  listItemSchema,
  listSchema,
  noteConflictSchema,
  noteItemSchema,
} from '@gameplan/domain';
import type {
  EntryTag,
  LibraryEntry,
  List,
  ListItem,
  NoteConflict,
  NoteItem,
} from '@gameplan/domain';
import type { z } from 'zod';
import { SYNCED_ROWS } from '@gameplan/storage';
import type { SyncedRowCodec } from '@gameplan/storage';
import type { RandomBytes } from '../ids';
import type { SyncedEntity } from '../op/schema';

/**
 * Time and randomness, supplied by the app so this package reads neither:
 * `Date.now` and expo-crypto on the phone, a fake clock and seeded bytes in
 * tests.
 */
export type SyncEnv = { now: () => number; randomBytes: RandomBytes };

/** The domain type stored for each entity this device can write. */
export type EntityValues = {
  library_entry: LibraryEntry;
  entry_tag: EntryTag;
  note_item: NoteItem;
  note_conflict: NoteConflict;
  list: List;
  list_item: ListItem;
};

export type StoredEntity = keyof EntityValues;

/** Library entries are archived, never deleted (SPEC-domain-model.md decision 12). */
export type DeletableEntity = Exclude<StoredEntity, 'library_entry'>;

const CODECS: { [E in StoredEntity]: SyncedRowCodec<EntityValues[E]> } = {
  library_entry: SYNCED_ROWS.library_entries,
  entry_tag: SYNCED_ROWS.entry_tags,
  note_item: SYNCED_ROWS.note_items,
  note_conflict: SYNCED_ROWS.note_conflicts,
  list: SYNCED_ROWS.lists,
  list_item: SYNCED_ROWS.list_items,
};

/**
 * Shape checks for a merged row before it is written. Shape only: a merge may
 * produce any combination of valid fields (SPEC-domain-model.md §Merge safety).
 */
export const SCHEMAS: { [E in StoredEntity]: z.ZodType<EntityValues[E]> } = {
  library_entry: libraryEntrySchema,
  entry_tag: entryTagSchema,
  note_item: noteItemSchema,
  note_conflict: noteConflictSchema,
  list: listSchema,
  list_item: listItemSchema,
};

export const codecFor = (entity: SyncedEntity): SyncedRowCodec<EntityValues[StoredEntity]> =>
  CODECS[entity] as SyncedRowCodec<EntityValues[StoredEntity]>;

export type Clocks = Record<string, string>;

export const parseClocks = (fieldHlc: string | undefined): Clocks =>
  fieldHlc === undefined ? {} : (JSON.parse(fieldHlc) as Clocks);

/**
 * Keys sorted, so two devices holding the same clocks store the same text,
 * whatever order the fields were written in.
 */
export const stringifyClocks = (clocks: Clocks): string =>
  JSON.stringify(Object.fromEntries(Object.entries(clocks).sort(([a], [b]) => (a < b ? -1 : 1))));

export const isoAt = (nowMs: number): string => new Date(nowMs).toISOString();
