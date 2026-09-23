import { describe, expect, it } from 'vitest';
import { tablesWritten } from './sql-tables';

describe('tablesWritten', () => {
  it('finds every table a statement writes to, however it is written', () => {
    expect(tablesWritten('INSERT INTO library_entries (id) VALUES (?)')).toEqual([
      'library_entries',
    ]);
    expect(tablesWritten('insert or replace into "entry_tags" (id) values (?)')).toEqual([
      'entry_tags',
    ]);
    expect(
      tablesWritten('UPDATE main.lists SET name = ?; DELETE FROM list_items WHERE id = ?'),
    ).toEqual(['lists', 'list_items']);
  });

  it('ignores reads, so a query never wakes a screen', () => {
    expect(tablesWritten('SELECT * FROM library_entries')).toEqual([]);
    expect(tablesWritten('PRAGMA user_version')).toEqual([]);
  });

  /** A quoted "insert into" in a value must not read as a write. */
  it('ignores SQL keywords inside string literals', () => {
    expect(tablesWritten("SELECT 'insert into games' AS note")).toEqual([]);
  });
});
