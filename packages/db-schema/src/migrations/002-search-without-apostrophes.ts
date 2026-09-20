import type { Migration } from './types';

/**
 * Makes search find a game whether or not the apostrophe is typed.
 *
 * The tokeniser splits `Assassin's` into `assassin` and `s`, so searching
 * `assassin's` works but `assassins` finds nothing — and people type the second
 * one. Same for `baldurs gate`, `no mans sky`, `marvels spider-man`.
 *
 * `games.name_search` is a generated column holding the title with both
 * straight (`'`) and curly (`’`) apostrophes removed, and the search index
 * covers it as a second column. Generated means it cannot drift from `name`,
 * and virtual means it costs no storage.
 */
export const migration002: Migration = {
  number: 2,
  name: 'search-without-apostrophes',
  statements: [
    `ALTER TABLE games ADD COLUMN name_search TEXT
       GENERATED ALWAYS AS (replace(replace(name, char(39), ''), char(8217), '')) VIRTUAL`,

    // The index and its triggers are rebuilt rather than altered: an FTS5
    // table's column list is fixed once created.
    `DROP TRIGGER games_fts_insert`,
    `DROP TRIGGER games_fts_delete`,
    `DROP TRIGGER games_fts_update`,
    `DROP TABLE games_fts`,

    `CREATE VIRTUAL TABLE games_fts USING fts5 (
      name,
      name_search,
      content = 'games',
      content_rowid = 'id',
      tokenize = 'unicode61'
    )`,
    `CREATE TRIGGER games_fts_insert AFTER INSERT ON games BEGIN
      INSERT INTO games_fts (rowid, name, name_search) VALUES (new.id, new.name, new.name_search);
    END`,
    `CREATE TRIGGER games_fts_delete AFTER DELETE ON games BEGIN
      INSERT INTO games_fts (games_fts, rowid, name, name_search)
        VALUES ('delete', old.id, old.name, old.name_search);
    END`,
    `CREATE TRIGGER games_fts_update AFTER UPDATE ON games BEGIN
      INSERT INTO games_fts (games_fts, rowid, name, name_search)
        VALUES ('delete', old.id, old.name, old.name_search);
      INSERT INTO games_fts (rowid, name, name_search) VALUES (new.id, new.name, new.name_search);
    END`,

    // Reindexes whatever the device already cached, so existing rows become
    // searchable the new way without a fresh fetch.
    `INSERT INTO games_fts (games_fts) VALUES ('rebuild')`,
  ],
};
