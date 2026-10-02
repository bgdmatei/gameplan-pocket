import {
  entryTagSchema,
  libraryEntrySchema,
  listItemSchema,
  listSchema,
  noteConflictSchema,
  noteItemSchema,
} from '@gameplan/domain';
import { z } from 'zod';
import { isHlc } from '../clock/hlc';

/** Bumped only by `schema-evolution` (module 11), which also upcasts old ops. */
export const OP_SCHEMA_VERSION = 1;

/**
 * Every field a `set` op may name, per entity, written out by hand.
 *
 * This is an allowlist, not a filter: a field is syncable only because it is
 * listed here, so adding a column to a table never makes it assignable by a
 * client by accident. Server-managed columns (`userId`, `deleted`, `fieldHlc`,
 * `updatedAt`, sequence numbers) are absent from every entry, and `id` travels
 * as the op's `entityId`. The server enforces the same list (CLAUDE.md
 * §Privacy rules).
 */
export const SYNCED_FIELDS = {
  library_entry: {
    gameId: true,
    status: true,
    rating: true,
    platformId: true,
    progress: true,
    playtimeMinutes: true,
    startedOn: true,
    finishedOn: true,
    favourite: true,
    shelved: true,
    archived: true,
    createdAt: true,
  },
  entry_tag: { entryId: true, tag: true },
  note_item: {
    entryId: true,
    type: true,
    text: true,
    location: true,
    resolved: true,
    createdAt: true,
  },
  note_conflict: {
    noteItemId: true,
    text: true,
    fromDeviceId: true,
    hlc: true,
    createdAt: true,
    resolved: true,
  },
  list: { name: true, description: true, createdAt: true },
  list_item: { listId: true, gameId: true, addedAt: true },
} as const;

export type SyncedEntity = keyof typeof SYNCED_FIELDS;

export const SYNCED_ENTITIES = Object.keys(SYNCED_FIELDS) as SyncedEntity[];

/**
 * Field values are shape-checked with the domain's own field schemas. Domain
 * *rules* (status transitions, cross-field checks) are not applied: a merge
 * must accept whatever state it produces (SPEC-domain-model.md §Merge safety).
 */
const FIELD_SCHEMAS = {
  library_entry: libraryEntrySchema.pick(SYNCED_FIELDS.library_entry),
  entry_tag: entryTagSchema.pick(SYNCED_FIELDS.entry_tag),
  note_item: noteItemSchema.pick(SYNCED_FIELDS.note_item),
  note_conflict: noteConflictSchema.pick(SYNCED_FIELDS.note_conflict),
  list: listSchema.pick(SYNCED_FIELDS.list),
  list_item: listItemSchema.pick(SYNCED_FIELDS.list_item),
};

const hlcSchema = z.string().refine(isHlc, { message: 'Not a clock value.' });

const envelope = {
  id: z.uuid(),
  entityId: z.string().min(1),
  hlc: hlcSchema,
  schemaVersion: z.literal(OP_SCHEMA_VERSION),
};

/** A `set` names at least one field; an empty change is never sent. */
const changedFields = <T extends z.ZodObject>(fields: T) =>
  fields
    .partial()
    .strict()
    .refine((value) => Object.keys(value).length > 0, {
      message: 'A set op must name at least one field.',
    });

const setOp = <E extends SyncedEntity>(entity: E) =>
  z
    .object({
      ...envelope,
      entity: z.literal(entity),
      type: z.literal('set'),
      fields: changedFields(FIELD_SCHEMAS[entity]),
    })
    .strict();

const deleteOp = <E extends SyncedEntity>(entity: E) =>
  z.object({ ...envelope, entity: z.literal(entity), type: z.literal('delete') }).strict();

/**
 * One edit, as it travels between devices. Ops describe changed fields, never
 * whole rows, so concurrent edits to different fields both survive.
 */
export const opSchema = z.union([
  setOp('library_entry'),
  setOp('entry_tag'),
  // Only note text edits carry `baseHlc`: the clock of the text the edit
  // started from, used by `notes-conflicts` (module 10) to spot concurrent
  // edits. Carried from day one so queued ops never need rewriting.
  setOp('note_item').extend({ baseHlc: hlcSchema.optional() }).strict(),
  setOp('note_conflict'),
  setOp('list'),
  setOp('list_item'),
  // Library entries are archived, never deleted (SPEC-domain-model.md
  // decision 12), so no delete op exists for them.
  deleteOp('entry_tag'),
  deleteOp('note_item'),
  deleteOp('note_conflict'),
  deleteOp('list'),
  deleteOp('list_item'),
]);

export type Op = z.output<typeof opSchema>;
