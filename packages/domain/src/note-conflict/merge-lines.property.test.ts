import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { mergeLines } from './merge-lines';

const keys = (text: string): string[] => text.split('\n').map((line) => line.trim());

const count = (text: string, line: string): number => keys(text).filter((k) => k === line).length;

/** Whether `part`'s lines appear in `whole` in order, compared as mergeLines compares them. */
const containsInOrder = (whole: string, part: string): boolean => {
  const lines = keys(whole);
  let at = 0;
  for (const line of keys(part)) {
    const found = lines.indexOf(line, at);
    if (found === -1) return false;
    at = found + 1;
  }
  return true;
};

// A small alphabet, so the two sides share lines often, blank ones included.
// Trimmed as the note schema stores it; indented lines, since the trim strips
// the first line's indent.
const text = fc
  .array(fc.constantFrom('Boss: fire', 'Key: chest', 'Lever', '  Lever', '', 'Map', 'Map '), {
    maxLength: 12,
  })
  .map((lines) => lines.join('\n').trim());

describe('mergeLines', () => {
  // Keep both once joined the two whole texts, so the text both grew from was
  // copied each time, and a repeated keep both doubled the note (owner, 2026-11-25).
  it('keeps the note in order and each line as often as the side holding more, never more', () => {
    fc.assert(
      fc.property(text, text, (current, other) => {
        const merged = mergeLines(current, other);
        expect(containsInOrder(merged, current)).toBe(true);
        for (const line of new Set([...keys(current), ...keys(other)])) {
          if (line === '') continue;
          expect(count(merged, line)).toBe(Math.max(count(current, line), count(other, line)));
        }
        // Again on the text as stored: keep both twice changes nothing more.
        const stored = merged.trim();
        expect(mergeLines(stored, other).trim()).toBe(stored);
      }),
    );
  });

  it.each([
    {
      case: 'each side added a line',
      current: 'Boss: fire\nKey: chest',
      other: 'Boss: fire\nLever: waterfall',
      merged: 'Boss: fire\nKey: chest\nLever: waterfall',
    },
    {
      case: 'other added in the middle',
      current: 'Start\nEnd',
      other: 'Start\nMiddle\nEnd',
      merged: 'Start\nMiddle\nEnd',
    },
    {
      // A tie once anchored on the blank line and joined both whole texts.
      case: 'one side appended a paragraph, the other prepended one',
      current: 'Y\n\nX',
      other: 'Z\n\nY',
      merged: 'Z\nY\n\nX',
    },
    {
      case: 'other only reordered',
      current: 'Boss\n\nKey',
      other: 'Key\n\nBoss',
      merged: 'Boss\n\nKey',
    },
    {
      case: 'other adds only blank lines',
      current: 'Boss',
      other: 'Boss\n\n',
      merged: 'Boss',
    },
    {
      case: 'nothing shared but blank lines',
      current: 'Lever, left one\n\nUp the stairs',
      other: 'Lever, right one\n\nDown the well',
      merged: 'Lever, left one\n\nUp the stairs\n\nLever, right one\n\nDown the well',
    },
  ])('$case', ({ current, other, merged }) => {
    expect(mergeLines(current, other)).toBe(merged);
  });

  it('keeps every new line of two long notes, at the end past the table budget', () => {
    const current = Array.from({ length: 1200 }, (_, i) => `a${String(i)}`).join('\n');
    const other = `a0\n${Array.from({ length: 1200 }, (_, i) => `b${String(i)}`).join('\n')}`;
    const merged = mergeLines(current, other);
    expect(merged.startsWith(current)).toBe(true);
    expect(keys(merged)).toHaveLength(1200 + 1 + 1200);
  });
});
