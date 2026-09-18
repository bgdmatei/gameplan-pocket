import { describe, expect, it } from 'vitest';
import { NOTE_ITEM_TYPES, compareNoteItems, noteItemSchema } from './schema';
import type { NoteItem } from './schema';

const item: NoteItem = {
  id: 'note-1',
  entryId: 'entry-1',
  type: 'puzzle',
  text: 'Torch order: left, right, centre.',
  location: 'Chapter 2',
  resolved: false,
  createdAt: '2026-09-18T10:00:00Z',
};

describe('noteItemSchema', () => {
  it('accepts a full item', () => {
    expect(noteItemSchema.safeParse(item).success).toBe(true);
  });

  it.each(NOTE_ITEM_TYPES)('accepts type %s', (type) => {
    expect(noteItemSchema.safeParse({ ...item, type }).success).toBe(true);
  });

  it('trims text and location', () => {
    const parsed = noteItemSchema.parse({ ...item, text: '  note  ', location: '  Act I  ' });
    expect(parsed).toMatchObject({ text: 'note', location: 'Act I' });
  });

  it('turns a blank location into null', () => {
    expect(noteItemSchema.parse({ ...item, location: '' }).location).toBeNull();
    expect(noteItemSchema.parse({ ...item, location: '   ' }).location).toBeNull();
    expect(noteItemSchema.parse({ ...item, location: null }).location).toBeNull();
  });

  it.each([
    ['empty text', { text: '' }],
    ['whitespace-only text', { text: '   ' }],
    ['text over 5,000 characters', { text: 'a'.repeat(5_001) }],
    ['location over 200 characters', { location: 'a'.repeat(201) }],
    ['unknown type', { type: 'spoiler' }],
    ['missing entry', { entryId: '' }],
    ['bad timestamp', { createdAt: '2026-09-18' }],
  ])('rejects %s', (_label, patch) => {
    expect(noteItemSchema.safeParse({ ...item, ...patch }).success).toBe(false);
  });

  it('accepts the longest allowed text and location', () => {
    expect(
      noteItemSchema.safeParse({ ...item, text: 'a'.repeat(5_000), location: 'a'.repeat(200) })
        .success,
    ).toBe(true);
  });

  it('rejects unknown fields', () => {
    expect(noteItemSchema.safeParse({ ...item, spoiler: true }).success).toBe(false);
  });
});

describe('compareNoteItems', () => {
  const at = (location: string | null, createdAt: string): NoteItem => ({
    ...item,
    location,
    createdAt,
  });

  it('orders by location, then by when it was written', () => {
    const items = [
      at(null, '2026-01-01T00:00:00Z'),
      at('Chapter 2', '2026-01-03T00:00:00Z'),
      at('Chapter 1', '2026-01-02T00:00:00Z'),
      at('Chapter 2', '2026-01-01T00:00:00Z'),
    ];

    expect(
      [...items].sort(compareNoteItems).map((entry) => [entry.location, entry.createdAt]),
    ).toEqual([
      ['Chapter 1', '2026-01-02T00:00:00Z'],
      ['Chapter 2', '2026-01-01T00:00:00Z'],
      ['Chapter 2', '2026-01-03T00:00:00Z'],
      [null, '2026-01-01T00:00:00Z'],
    ]);
  });

  it('puts items with no location last', () => {
    expect(
      compareNoteItems(at(null, item.createdAt), at('Chapter 1', item.createdAt)),
    ).toBeGreaterThan(0);
    expect(
      compareNoteItems(at('Chapter 1', item.createdAt), at(null, item.createdAt)),
    ).toBeLessThan(0);
  });

  it('orders two notes in the same location both ways', () => {
    const older = at('Chapter 1', '2026-01-01T00:00:00Z');
    const newer = at('Chapter 1', '2026-02-01T00:00:00Z');
    expect(compareNoteItems(older, newer)).toBeLessThan(0);
    expect(compareNoteItems(newer, older)).toBeGreaterThan(0);
  });

  it('treats two identical items as equal', () => {
    expect(compareNoteItems(item, { ...item })).toBe(0);
  });
});
