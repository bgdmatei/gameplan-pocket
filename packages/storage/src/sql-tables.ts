/**
 * Which tables a statement writes to, so `subscribe` can tell one screen from
 * another without every caller having to declare it.
 *
 * This reads the statement rather than parsing SQL properly: it matches the
 * three write forms at a statement boundary. That is enough because every
 * statement in this package is written by a repository or a migration, never
 * by a user. String literals are stripped first so a quoted "insert into" in
 * a value cannot be mistaken for a write.
 */
const WRITE_PATTERN =
  /(?:^|;)\s*(?:insert(?:\s+or\s+\w+)?\s+into|replace\s+into|update|delete\s+from)\s+([`"[\]\w.]+)/gi;

const stripStringLiterals = (sql: string): string => sql.replace(/'(?:[^']|'')*'/g, "''");

/** `main.library_entries`, `"lists"` and `` `games` `` all name one table. */
const cleanName = (raw: string): string => {
  const unquoted = raw.replace(/[`"[\]]/g, '');
  const parts = unquoted.split('.');
  return parts[parts.length - 1] ?? unquoted;
};

export const tablesWritten = (sql: string): string[] => {
  const tables = new Set<string>();

  for (const match of stripStringLiterals(sql).matchAll(WRITE_PATTERN)) {
    const name = match[1];
    if (name !== undefined) tables.add(cleanName(name));
  }

  return [...tables];
};
