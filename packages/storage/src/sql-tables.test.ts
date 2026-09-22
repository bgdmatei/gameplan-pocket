import { describe, expect, it } from 'vitest';
import { tablesWritten } from './sql-tables';

describe('tablesWritten', () => {
  it.each([
    ['INSERT INTO library_entries (id) VALUES (?)', ['library_entries']],
    ['insert or replace into entry_tags (id) values (?)', ['entry_tags']],
    ['REPLACE INTO note_items (id) VALUES (?)', ['note_items']],
    ['UPDATE library_entries SET rating = ? WHERE id = ?', ['library_entries']],
    ['update  lists  set name = ?', ['lists']],
    ['DELETE FROM list_items WHERE id = ?', ['list_items']],
    ['delete from games', ['games']],
  ])('finds the table in %s', (sql, expected) => {
    expect(tablesWritten(sql)).toEqual(expected);
  });

  it('ignores reads', () => {
    expect(tablesWritten('SELECT * FROM library_entries')).toEqual([]);
    expect(tablesWritten('PRAGMA user_version')).toEqual([]);
    expect(tablesWritten('EXPLAIN QUERY PLAN SELECT 1')).toEqual([]);
  });

  it('handles quoted and schema-qualified names', () => {
    expect(tablesWritten('INSERT INTO "note_items" (id) VALUES (?)')).toEqual(['note_items']);
    expect(tablesWritten('INSERT INTO `lists` (id) VALUES (?)')).toEqual(['lists']);
    expect(tablesWritten('UPDATE main.library_entries SET rating = 1')).toEqual([
      'library_entries',
    ]);
  });

  it('finds every table a multi-statement string writes to', () => {
    const sql = `INSERT INTO library_entries (id) VALUES (?);
                 DELETE FROM entry_tags WHERE entry_id = ?`;
    expect(tablesWritten(sql)).toEqual(['library_entries', 'entry_tags']);
  });

  it('reports a table once however often it is written', () => {
    const sql = 'UPDATE lists SET name = ?; UPDATE lists SET description = ?';
    expect(tablesWritten(sql)).toEqual(['lists']);
  });

  it('ignores the word insert inside a string literal', () => {
    expect(tablesWritten("SELECT 'insert into games' AS note")).toEqual([]);
  });
});
