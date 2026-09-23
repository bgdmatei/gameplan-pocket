import { describe, expect, it } from 'vitest';
import { DomainValidationError } from '../shared/errors';
import { applyNoteItemChange, createNoteItem } from './changes';
import { compareNoteItems } from './schema';
import type { NoteItem } from './schema';

const NOW = '2026-09-18T10:00:00Z';

const note = (patch: Partial<NoteItem> = {}): NoteItem => ({
  ...createNoteItem({
    id: 'note-1',
    entryId: 'entry-1',
    createdAt: NOW,
    type: 'puzzle',
    text: 'Torch order: left, right, centre.',
  }),
  ...patch,
});

describe('note items', () => {
  it('defaults to open with no location, and trims what it stores', () => {
    const item = createNoteItem({
      id: 'n',
      entryId: 'e',
      createdAt: NOW,
      type: 'secret',
      text: '  Hidden door  ',
      location: '   ',
    });

    expect(item).toMatchObject({ text: 'Hidden door', location: null, resolved: false });
  });

  it('treats a re-saved note as unchanged, so the editor does not sync on every keystroke', () => {
    const current = note();

    expect(applyNoteItemChange(current, { text: `  ${current.text}  ` }).changed).toEqual({});
    expect(applyNoteItemChange(current, { resolved: true }).changed).toEqual({ resolved: true });
  });

  it('refuses text that is only whitespace', () => {
    expect(() => applyNoteItemChange(note(), { text: '   ' })).toThrow(DomainValidationError);
  });

  it('reads in order: by location, oldest first, unplaced notes last', () => {
    const items = [
      note({ id: 'a', location: 'Chapter 2', createdAt: '2026-09-18T10:00:00Z' }),
      note({ id: 'b', location: 'Chapter 1', createdAt: '2026-09-19T10:00:00Z' }),
      note({ id: 'c', location: null }),
      note({ id: 'd', location: 'Chapter 2', createdAt: '2026-09-17T10:00:00Z' }),
    ];

    expect([...items].sort(compareNoteItems).map((item) => item.id)).toEqual(['b', 'd', 'a', 'c']);
  });
});
