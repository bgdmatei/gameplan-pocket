import { describe, expect, it } from 'vitest';
import { DomainValidationError } from '../shared/errors';
import type { DomainError } from '../shared/errors';
import { applyNoteItemChange, createNoteItem } from './changes';
import { noteItemSchema } from './schema';
import type { NoteItem } from './schema';

const base: NoteItem = {
  id: 'note-1',
  entryId: 'entry-1',
  type: 'puzzle',
  text: 'Torch order: left, right, centre.',
  location: 'Chapter 2',
  resolved: false,
  createdAt: '2026-09-18T10:00:00Z',
};

const errorsOf = (write: () => unknown): readonly DomainError[] => {
  try {
    write();
  } catch (error) {
    if (error instanceof DomainValidationError) return error.errors;
    throw error;
  }
  throw new Error('expected the write to be rejected');
};

describe('createNoteItem', () => {
  const input = { id: base.id, entryId: base.entryId, createdAt: base.createdAt };

  it('defaults to an open note with no location', () => {
    expect(createNoteItem({ ...input, type: 'other', text: 'Check the well.' })).toEqual({
      ...input,
      type: 'other',
      text: 'Check the well.',
      location: null,
      resolved: false,
    });
  });

  it('trims text and location', () => {
    const item = createNoteItem({
      ...input,
      type: 'secret',
      text: '  Hidden door  ',
      location: '  Act I  ',
    });
    expect(item).toMatchObject({ text: 'Hidden door', location: 'Act I' });
  });

  it('can be created already resolved', () => {
    expect(createNoteItem({ ...input, type: 'other', text: 'Done', resolved: true }).resolved).toBe(
      true,
    );
  });

  it('rejects empty text', () => {
    const errors = errorsOf(() => createNoteItem({ ...input, type: 'other', text: '   ' }));
    expect(errors[0]).toMatchObject({ code: 'invalid_field', field: 'text' });
  });
});

describe('applyNoteItemChange', () => {
  it('returns no changes for a no-op patch', () => {
    const result = applyNoteItemChange(base, { type: 'puzzle', resolved: false });
    expect(result.changed).toEqual({});
    expect(result.next).toEqual(base);
  });

  it('returns only the fields that differ', () => {
    const result = applyNoteItemChange(base, { resolved: true, type: 'puzzle' });
    expect(result.changed).toEqual({ resolved: true });
    expect(result.next).toEqual({ ...base, resolved: true });
  });

  it('marks unfinished business as resolved', () => {
    expect(applyNoteItemChange(base, { resolved: true }).next.resolved).toBe(true);
  });

  it('clears a location', () => {
    const result = applyNoteItemChange(base, { location: '' });
    expect(result.changed).toEqual({ location: null });
  });

  it('treats a whitespace-only text edit as invalid', () => {
    const errors = errorsOf(() => applyNoteItemChange(base, { text: '   ' }));
    expect(errors[0]).toMatchObject({ code: 'invalid_field', field: 'text' });
  });

  it('compares text after trimming, so re-saving the same note is a no-op', () => {
    expect(applyNoteItemChange(base, { text: `  ${base.text}  ` }).changed).toEqual({});
  });

  it('ignores explicitly undefined fields', () => {
    expect(applyNoteItemChange(base, { text: undefined }).changed).toEqual({});
  });

  it('rejects identity and unknown fields', () => {
    expect(() => applyNoteItemChange(base, { id: 'other' } as never)).toThrow(
      DomainValidationError,
    );
    expect(() => applyNoteItemChange(base, { entryId: 'other' } as never)).toThrow(
      DomainValidationError,
    );
    expect(() => applyNoteItemChange(base, { spoiler: true } as never)).toThrow(
      DomainValidationError,
    );
  });

  it('always leaves a well-formed item', () => {
    const result = applyNoteItemChange(base, { type: 'npc_hint', location: 'Act III' });
    expect(noteItemSchema.safeParse(result.next).success).toBe(true);
  });

  it('is idempotent', () => {
    const patch = { text: 'Updated note', resolved: true } as const;
    const first = applyNoteItemChange(base, patch);
    expect(applyNoteItemChange(first.next, patch).changed).toEqual({});
  });
});
