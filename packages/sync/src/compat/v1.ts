import type { SnapshotRow } from '@gameplan/contracts';
import { z } from 'zod';
import { DELETE_CLOCK } from '../merge/merge';
import { FIELD_SCHEMAS, buildOpSchema, isSyncedEntity, opSchema } from '../op/schema';
import type { FieldSchemas, Op, SyncedEntity } from '../op/schema';

// Frozen copy of v1's allowlist: never edit. A field added to SYNCED_FIELDS later is one v1 doesn't know.
const V1_SYNCED = {
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

const V1_FIELDS: FieldSchemas = {
  library_entry: FIELD_SCHEMAS.library_entry
    .pick(V1_SYNCED.library_entry)
    .extend({ rating: z.number().int().min(0).max(10).nullable() }),
  entry_tag: FIELD_SCHEMAS.entry_tag.pick(V1_SYNCED.entry_tag),
  note_item: FIELD_SCHEMAS.note_item.pick(V1_SYNCED.note_item),
  note_conflict: FIELD_SCHEMAS.note_conflict.pick(V1_SYNCED.note_conflict),
  list: FIELD_SCHEMAS.list.pick(V1_SYNCED.list),
  list_item: FIELD_SCHEMAS.list_item.pick(V1_SYNCED.list_item),
};

export const opV1Schema = buildOpSchema(1, V1_FIELDS);

export type OpV1 = z.output<typeof opV1Schema>;

const STEP = 10;

type Fields = Record<string, unknown>;

const withRating = (fields: Fields, convert: (rating: number) => number): Fields =>
  typeof fields.rating === 'number' ? { ...fields, rating: convert(fields.rating) } : fields;

const v1Fields = <T>(entity: SyncedEntity, record: Readonly<Record<string, T>>) =>
  Object.fromEntries(
    Object.entries(record).filter(([field]) => Object.hasOwn(V1_FIELDS[entity].shape, field)),
  );

export const upcastOp = (op: OpV1): Op =>
  opSchema.parse({
    ...op,
    schemaVersion: 2,
    ...(op.type === 'set' &&
      op.entity === 'library_entry' && { fields: withRating(op.fields, (r) => r * STEP) }),
  });

// v1 is checked as v1 first, so an out-of-range v1 value is refused, not converted.
export const toCurrentOp = (raw: unknown): Op | null => {
  const v1 = opV1Schema.safeParse(raw);
  if (v1.success) return upcastOp(v1.data);
  const current = opSchema.safeParse(raw);
  return current.success ? current.data : null;
};

/** Null when a set names only fields v1 doesn't know. */
export const downcastOp = (op: Op, to: 1): OpV1 | null => {
  if (op.type !== 'set') return opV1Schema.parse({ ...op, schemaVersion: to });
  const known = v1Fields(op.entity, op.fields);
  const fields =
    op.entity === 'library_entry' ? withRating(known, (r) => Math.round(r / STEP)) : known;
  if (Object.keys(fields).length === 0) return null;
  return opV1Schema.parse({ ...op, schemaVersion: to, fields });
};

export const downcastRow = (row: SnapshotRow): SnapshotRow => {
  if (!isSyncedEntity(row.entity)) return row;
  const known = v1Fields(row.entity, row.fields);
  const deletedAt = row.fieldHlc[DELETE_CLOCK];
  return {
    ...row,
    fields: row.entity === 'library_entry' ? withRating(known, (r) => Math.round(r / STEP)) : known,
    fieldHlc: {
      ...v1Fields(row.entity, row.fieldHlc),
      ...(deletedAt !== undefined && { [DELETE_CLOCK]: deletedAt }),
    },
  };
};
