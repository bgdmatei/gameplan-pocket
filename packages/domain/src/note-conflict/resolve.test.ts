import { describe, expect, it } from 'vitest';
import { createNoteItem } from '../note-item/changes';
import { NOTE_TEXT_MAX_LENGTH } from '../note-item/schema';
import { DomainValidationError } from '../shared/errors';
import { resolveConflict } from './resolve';
import type { NoteConflict } from './schema';

const note = createNoteItem({
  id: 'note-1',
  entryId: 'entry-1',
  createdAt: '2026-11-24T10:00:00.000Z',
  type: 'puzzle',
  text: 'Lever, left one',
});

const conflict: NoteConflict = {
  id: 'conflict-1',
  noteItemId: 'note-1',
  text: 'Lever, right one',
  fromNodeId: '00000000000000aa',
  hlc: '000000000000001:00000:00000000000000aa',
  createdAt: '2026-11-24T10:00:00.000Z',
  resolved: false,
};

describe('resolveConflict', () => {
  it.each([
    { choice: 'keep_current' as const, text: undefined },
    { choice: 'keep_other' as const, text: 'Lever, right one' },
    { choice: 'keep_both' as const, text: 'Lever, left one\n\nLever, right one' },
  ])('$choice resolves the conflict and sets the text to $text', ({ choice, text }) => {
    const resolution = resolveConflict(note, conflict, choice);

    expect(resolution.note?.changed).toEqual(text === undefined ? undefined : { text });
    expect(resolution.conflict).toEqual({
      next: { ...conflict, resolved: true },
      changed: { resolved: true },
    });
  });

  it('changes nothing for a conflict already resolved', () => {
    expect(resolveConflict(note, { ...conflict, resolved: true }, 'keep_both')).toEqual({
      note: undefined,
      conflict: { next: { ...conflict, resolved: true }, changed: {} },
    });
  });

  // Owner, 2026-11-23: past the note limit nothing changes, and the user
  // keeps one version or shortens first. The blank line counts.
  it.each([
    { joined: NOTE_TEXT_MAX_LENGTH, refused: false },
    { joined: NOTE_TEXT_MAX_LENGTH + 1, refused: true },
  ])('keeping both at $joined characters is refused: $refused', ({ joined, refused }) => {
    const other = { ...conflict, text: 'x'.repeat(joined - note.text.length - 2) };
    const keepBoth = () => resolveConflict(note, other, 'keep_both');

    if (refused) expect(keepBoth).toThrow(DomainValidationError);
    else expect(keepBoth().note?.next.text).toHaveLength(joined);
  });
});
