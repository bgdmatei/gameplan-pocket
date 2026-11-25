/**
 * Lines match ignoring spaces at either end: keyboards add trailing ones, and
 * the note schema trims the whole text, which strips the first line's indent.
 * Matching on the untrimmed line made keep both add that line again next time.
 */
const key = (line: string): string => line.trim();

const counts = (keys: readonly string[]): Map<string, number> => {
  const found = new Map<string, number>();
  for (const k of keys) found.set(k, (found.get(k) ?? 0) + 1);
  return found;
};

/**
 * A content line outweighs every blank line a note can hold (5,001 at most),
 * so the alignment anchors on content: a tie never pins it to a blank line.
 */
const CONTENT_WEIGHT = 8192;

/**
 * Past this many table cells (4 bytes each), new lines go after a blank line
 * below the differing middle, before the shared end, instead of where they
 * sit: placement degrades, never what is kept.
 */
const MAX_CELLS = 1_000_000;

/**
 * Keep both: the note with every line of the other version it
 * lacks, counting copies, so nothing is lost and nothing is doubled: lines
 * the two share stay once, even reordered, and keeping both again when the
 * other side holds nothing new changes nothing. New lines go where they sit
 * relative to the lines both share, after current's at the same place.
 * Without the text both grew from, a line one side deleted can't be told from
 * a line the other added, so it is kept. Blank lines alone are never news.
 *
 * Versions that share no content line are unrelated texts, joined whole with
 * a blank line rather than interleaved around their blank lines.
 */
export const mergeLines = (current: string, other: string): string => {
  const a = current.split('\n');
  const b = other.split('\n');
  const keysA = a.map(key);
  const keysB = b.map(key);
  const countA = counts(keysA);
  const countB = counts(keysB);

  // How many more copies of each line the other version holds.
  const missing = new Map<string, number>();
  for (const [k, n] of countB) {
    const extra = n - (countA.get(k) ?? 0);
    if (extra > 0) missing.set(k, extra);
  }
  if ([...missing.keys()].every((k) => k === '')) return current;
  if (![...countB.keys()].some((k) => k !== '' && countA.has(k))) {
    return `${current}\n\n${other}`;
  }

  // Shared ends need no table, and are most of a note in practice.
  let start = 0;
  while (start < a.length && start < b.length && keysA[start] === keysB[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && keysA[endA - 1] === keysB[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }

  const n = endA - start;
  const m = endB - start;
  const added: string[] = [];
  const take = (j: number): void => {
    const k = keysB[j] ?? '';
    const left = missing.get(k) ?? 0;
    if (left === 0) return;
    missing.set(k, left - 1);
    added.push(b[j] ?? '');
  };

  if (n * m > MAX_CELLS) {
    for (let j = start; j < endB; j += 1) take(j);
    const middle = [...a.slice(start, endA), ...(added.length > 0 ? ['', ...added] : [])];
    return [...a.slice(0, start), ...middle, ...a.slice(endA)].join('\n');
  }

  // Heaviest common subsequence of every suffix of the middles, content lines
  // weighted over blank ones. At most 2,500 content lines a side fit in a note,
  // so a cell stays under 2^32.
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  const at = (i: number, j: number): number => table[i * width + j] ?? 0;
  const same = (i: number, j: number): boolean => keysA[start + i] === keysB[start + j];
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] = same(i, j)
        ? at(i + 1, j + 1) + (keysA[start + i] === '' ? 1 : CONTENT_WEIGHT)
        : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }

  const middle: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && same(i, j)) {
      middle.push(a[start + i] ?? '');
      i += 1;
      j += 1;
    } else if (j >= m || (i < n && at(i + 1, j) >= at(i, j + 1))) {
      middle.push(a[start + i] ?? '');
      i += 1;
    } else {
      added.length = 0;
      take(start + j);
      middle.push(...added);
      j += 1;
    }
  }
  return [...a.slice(0, start), ...middle, ...a.slice(endA)].join('\n');
};
