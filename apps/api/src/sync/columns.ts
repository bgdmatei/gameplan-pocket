import type { SYNCED_FIELDS, SyncedEntity } from '@gameplan/sync';
import type { Database } from '../db/schema';

type ServerEntity = Exclude<SyncedEntity, 'note_conflict'>;

type ColumnsOf<E extends ServerEntity> = {
  readonly [F in keyof (typeof SYNCED_FIELDS)[E]]: string;
};

type EntityTable<E extends ServerEntity> = {
  table: keyof Database & string;
  /** Domain field → column. Explicit, so nothing outside it is ever written. */
  columns: ColumnsOf<E>;
  /** Columns stored as jsonb: written as JSON text, read back parsed. */
  json: ReadonlySet<string>;
};

/**
 * Where each synced entity lives on the server (migration 003). The type
 * demands a column for every synced field, so a field added to the op schema
 * without one fails to compile rather than vanishing on the server.
 */
export const ENTITY_TABLES: { readonly [E in ServerEntity]: EntityTable<E> } = {
  library_entry: {
    table: 'library_entries',
    columns: {
      gameId: 'game_id',
      status: 'status',
      rating: 'rating',
      platformId: 'platform_id',
      progress: 'progress',
      playtimeMinutes: 'playtime_minutes',
      startedOn: 'started_on',
      finishedOn: 'finished_on',
      favourite: 'favourite',
      shelved: 'shelved',
      archived: 'archived',
      createdAt: 'created_at',
    },
    json: new Set(['progress']),
  },
  entry_tag: {
    table: 'entry_tags',
    columns: { entryId: 'entry_id', tag: 'tag' },
    json: new Set(),
  },
  note_item: {
    table: 'note_items',
    columns: {
      entryId: 'entry_id',
      type: 'type',
      text: 'text',
      location: 'location',
      resolved: 'resolved',
      createdAt: 'created_at',
    },
    json: new Set(),
  },
  list: {
    table: 'lists',
    columns: { name: 'name', description: 'description', createdAt: 'created_at' },
    json: new Set(),
  },
  list_item: {
    table: 'list_items',
    columns: { listId: 'list_id', gameId: 'game_id', addedAt: 'added_at' },
    json: new Set(),
  },
};

export const isServerEntity = (entity: SyncedEntity): entity is ServerEntity =>
  entity in ENTITY_TABLES;

export type { ServerEntity };
