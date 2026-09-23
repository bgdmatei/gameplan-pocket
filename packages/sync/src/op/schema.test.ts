import { describe, expect, it } from 'vitest';
import { opSchema } from './schema';

const envelope = {
  id: '01890a5d-ac96-774b-bcce-b302099a8057',
  entityId: '9b385207-54aa-5778-81a4-815107b15eb0',
  hlc: '000001790000000:00000:3f9a2c1b7d4e8f60',
  schemaVersion: 1,
};

describe('op schema', () => {
  it.each([
    {
      label: 'a set of derived dates with a status',
      op: {
        entity: 'library_entry',
        type: 'set',
        fields: { status: 'completed', startedOn: '2026-09-01', finishedOn: '2026-09-23' },
      },
    },
    { label: 'a delete', op: { entity: 'note_item', type: 'delete' } },
    {
      label: 'a note text edit carrying its base clock',
      op: {
        entity: 'note_item',
        type: 'set',
        fields: { text: 'Lever behind the waterfall' },
        baseHlc: '000001780000000:00003:00000000000000aa',
      },
    },
  ])('accepts $label', ({ op }) => {
    expect(opSchema.safeParse({ ...envelope, ...op }).success).toBe(true);
  });

  // The attack: a client naming a server-managed column, a field that does
  // not exist, or an entity that does not exist gets nothing applied.
  it.each([
    {
      label: 'a set naming userId',
      op: { entity: 'library_entry', type: 'set', fields: { userId: 'someone-else' } },
    },
    {
      label: 'a set naming deleted',
      op: { entity: 'library_entry', type: 'set', fields: { deleted: false } },
    },
    {
      label: 'a set naming fieldHlc',
      op: { entity: 'note_item', type: 'set', fields: { fieldHlc: '{}' } },
    },
    {
      label: 'a set naming updatedAt',
      op: { entity: 'list', type: 'set', fields: { updatedAt: '2026-09-23T00:00:00.000Z' } },
    },
    {
      label: 'a set naming id',
      op: { entity: 'list', type: 'set', fields: { id: 'another-row' } },
    },
    {
      label: 'a set naming an unknown field',
      op: { entity: 'library_entry', type: 'set', fields: { rating: 8, mood: 'happy' } },
    },
    {
      label: 'an unknown entity',
      op: { entity: 'user', type: 'set', fields: { email: 'x@example.com' } },
    },
    { label: 'fields on a delete', op: { entity: 'list', type: 'delete', fields: { name: 'x' } } },
    {
      label: 'baseHlc outside note items',
      op: { entity: 'list', type: 'set', fields: { name: 'x' }, baseHlc: envelope.hlc },
    },
    { label: 'a delete of a library entry', op: { entity: 'library_entry', type: 'delete' } },
    { label: 'an empty set', op: { entity: 'list', type: 'set', fields: {} } },
  ])('rejects $label', ({ op }) => {
    expect(opSchema.safeParse({ ...envelope, ...op }).success).toBe(false);
  });
});
