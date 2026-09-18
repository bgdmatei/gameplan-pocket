import { describe, expect, it } from 'vitest';
import { noteConflictSchema } from './schema';

const conflict = {
  id: 'conflict-1',
  noteItemId: 'note-1',
  text: 'The other version of this note.',
  fromDeviceId: 'device-2',
  hlc: '00000001758196800000:0000:device-2',
  createdAt: '2026-09-18T10:00:00Z',
  resolved: false,
};

describe('noteConflictSchema', () => {
  it('accepts a conflict copy', () => {
    expect(noteConflictSchema.safeParse(conflict).success).toBe(true);
  });

  it('treats the hlc as an opaque string: domain never parses it', () => {
    expect(noteConflictSchema.safeParse({ ...conflict, hlc: 'anything-non-empty' }).success).toBe(
      true,
    );
    expect(noteConflictSchema.safeParse({ ...conflict, hlc: '' }).success).toBe(false);
  });

  it.each([
    ['empty text', { text: '' }],
    ['missing note item', { noteItemId: '' }],
    ['missing device', { fromDeviceId: '' }],
    ['bad timestamp', { createdAt: 'yesterday' }],
    ['non-boolean resolved', { resolved: 'no' }],
  ])('rejects %s', (_label, patch) => {
    expect(noteConflictSchema.safeParse({ ...conflict, ...patch }).success).toBe(false);
  });
});
