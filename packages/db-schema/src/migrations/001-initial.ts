import type { Migration } from './types';

/**
 * Every table the app starts with.
 *
 * Two decisions run through the whole schema:
 *
 * 1. **Sync columns from day one.** Synced rows carry `field_hlc` (per-field
 *    clocks) and `deleted` (tombstones) even though nothing syncs until module
 *    8. Adding them later means rewriting every row and every query.
 * 2. **No foreign keys between synced tables.** Sync delivers operations in
 *    whatever order they arrive, so a note can land before the entry it
 *    belongs to. A foreign key would reject that perfectly normal case.
 *    Catalog join tables do use foreign keys: the server writes them together.
 */
export const migration001: Migration = {
  number: 1,
  name: 'initial',
  statements: [
    // --- user data -------------------------------------------------------
    `CREATE TABLE library_entries (
      id TEXT PRIMARY KEY,
      game_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      rating INTEGER,
      platform_id INTEGER,
      -- The whole progress union as JSON: type and value always travel
      -- together, so a merge can't pair one device's type with another's value.
      progress TEXT,
      playtime_minutes INTEGER NOT NULL DEFAULT 0,
      started_on TEXT,
      finished_on TEXT,
      favourite INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      -- Local bookkeeping for the "recently updated" sort; not a domain field.
      updated_at TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      field_hlc TEXT NOT NULL DEFAULT '{}'
    )`,
    // One entry per game. Re-adding a removed game reuses the same row (its id
    // is derived from the game), so the tombstone flips back rather than
    // colliding.
    `CREATE UNIQUE INDEX idx_library_entries_game ON library_entries (game_id)`,
    `CREATE INDEX idx_library_entries_status ON library_entries (status, updated_at)`,
    `CREATE INDEX idx_library_entries_live ON library_entries (deleted, updated_at)`,

    `CREATE TABLE entry_tags (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      created_at TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      field_hlc TEXT NOT NULL DEFAULT '{}'
    )`,
    `CREATE UNIQUE INDEX idx_entry_tags_unique ON entry_tags (entry_id, tag)`,

    `CREATE TABLE note_items (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL,
      type TEXT NOT NULL,
      text TEXT NOT NULL,
      location TEXT,
      resolved INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      field_hlc TEXT NOT NULL DEFAULT '{}'
    )`,
    // Drives "what's still open in this game", the notes screen's main list.
    `CREATE INDEX idx_note_items_entry ON note_items (entry_id, resolved)`,

    `CREATE TABLE note_conflicts (
      id TEXT PRIMARY KEY,
      note_item_id TEXT NOT NULL,
      text TEXT NOT NULL,
      from_device_id TEXT NOT NULL,
      hlc TEXT NOT NULL,
      created_at TEXT NOT NULL,
      resolved INTEGER NOT NULL DEFAULT 0,
      deleted INTEGER NOT NULL DEFAULT 0,
      field_hlc TEXT NOT NULL DEFAULT '{}'
    )`,
    `CREATE INDEX idx_note_conflicts_item ON note_conflicts (note_item_id, resolved)`,

    `CREATE TABLE lists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      field_hlc TEXT NOT NULL DEFAULT '{}'
    )`,

    `CREATE TABLE list_items (
      id TEXT PRIMARY KEY,
      list_id TEXT NOT NULL,
      game_id INTEGER NOT NULL,
      added_at TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      field_hlc TEXT NOT NULL DEFAULT '{}'
    )`,
    `CREATE UNIQUE INDEX idx_list_items_unique ON list_items (list_id, game_id)`,

    // --- catalog cache (server-authoritative, read-only here) -------------
    `CREATE TABLE games (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      summary TEXT,
      first_release_date TEXT,
      cover_image_id TEXT,
      catalog_version INTEGER NOT NULL DEFAULT 0,
      fetched_at TEXT NOT NULL
    )`,
    `CREATE TABLE genres (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL
    )`,
    `CREATE TABLE platforms (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      abbreviation TEXT
    )`,
    `CREATE TABLE game_genres (
      game_id INTEGER NOT NULL REFERENCES games (id) ON DELETE CASCADE,
      genre_id INTEGER NOT NULL REFERENCES genres (id) ON DELETE CASCADE,
      PRIMARY KEY (game_id, genre_id)
    )`,
    `CREATE TABLE game_platforms (
      game_id INTEGER NOT NULL REFERENCES games (id) ON DELETE CASCADE,
      platform_id INTEGER NOT NULL REFERENCES platforms (id) ON DELETE CASCADE,
      PRIMARY KEY (game_id, platform_id)
    )`,

    // Full-text search over cached game names: instant local search, offline.
    // `content=games` keeps the text in the games table rather than copying it;
    // the triggers below keep the index in step.
    `CREATE VIRTUAL TABLE games_fts USING fts5 (
      name,
      content = 'games',
      content_rowid = 'id',
      tokenize = 'unicode61'
    )`,
    `CREATE TRIGGER games_fts_insert AFTER INSERT ON games BEGIN
      INSERT INTO games_fts (rowid, name) VALUES (new.id, new.name);
    END`,
    `CREATE TRIGGER games_fts_delete AFTER DELETE ON games BEGIN
      INSERT INTO games_fts (games_fts, rowid, name) VALUES ('delete', old.id, old.name);
    END`,
    `CREATE TRIGGER games_fts_update AFTER UPDATE ON games BEGIN
      INSERT INTO games_fts (games_fts, rowid, name) VALUES ('delete', old.id, old.name);
      INSERT INTO games_fts (rowid, name) VALUES (new.id, new.name);
    END`,

    // --- sync bookkeeping -------------------------------------------------
    // Outbox. `payload` is opaque here: sync-core owns the format, storage
    // keeps insertion order and hands it back untouched.
    `CREATE TABLE pending_ops (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,

    // Exactly one row, enforced by the check constraint.
    `CREATE TABLE sync_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      node_id TEXT,
      last_pulled_seq INTEGER NOT NULL DEFAULT 0,
      hlc_last TEXT,
      schema_version INTEGER NOT NULL DEFAULT 1,
      catalog_version INTEGER NOT NULL DEFAULT 0
    )`,
    `INSERT INTO sync_state (id) VALUES (1)`,
  ],
};
