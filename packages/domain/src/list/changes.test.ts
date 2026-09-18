import { describe, expect, it } from 'vitest';
import { DomainValidationError } from '../shared/errors';
import { applyListChange, createList, createListItem } from './changes';
import type { List } from './schema';

const base: List = {
  id: 'list-1',
  name: 'Best of 2025',
  description: null,
  createdAt: '2026-09-18T10:00:00Z',
};

describe('createList', () => {
  it('defaults to no description', () => {
    expect(createList({ id: base.id, name: 'Co-op', createdAt: base.createdAt })).toEqual({
      id: base.id,
      name: 'Co-op',
      description: null,
      createdAt: base.createdAt,
    });
  });

  it('trims what it stores', () => {
    const created = createList({
      id: base.id,
      name: '  Co-op  ',
      description: '  With Ana  ',
      createdAt: base.createdAt,
    });
    expect(created).toMatchObject({ name: 'Co-op', description: 'With Ana' });
  });

  it('throws for an empty name', () => {
    expect(() => createList({ id: base.id, name: '   ', createdAt: base.createdAt })).toThrow(
      DomainValidationError,
    );
  });
});

describe('applyListChange', () => {
  it('returns no changes for a no-op patch', () => {
    expect(applyListChange(base, { name: 'Best of 2025' }).changed).toEqual({});
  });

  it('renames a list', () => {
    const result = applyListChange(base, { name: 'Best of 2026' });
    expect(result.changed).toEqual({ name: 'Best of 2026' });
    expect(result.next.name).toBe('Best of 2026');
  });

  it('clears a description', () => {
    const described = { ...base, description: 'Games I loved' };
    expect(applyListChange(described, { description: '' }).changed).toEqual({ description: null });
  });

  it('compares names after trimming', () => {
    expect(applyListChange(base, { name: '  Best of 2025  ' }).changed).toEqual({});
  });

  it('rejects identity and unknown fields', () => {
    expect(() => applyListChange(base, { id: 'other' } as never)).toThrow(DomainValidationError);
    expect(() => applyListChange(base, { public: true } as never)).toThrow(DomainValidationError);
  });

  it('throws for an empty name', () => {
    expect(() => applyListChange(base, { name: '  ' })).toThrow(DomainValidationError);
  });

  it('is idempotent', () => {
    const patch = { name: 'Co-op', description: 'With Ana' } as const;
    const first = applyListChange(base, patch);
    expect(applyListChange(first.next, patch).changed).toEqual({});
  });
});

describe('createListItem', () => {
  it('builds an item for any catalog game', () => {
    expect(
      createListItem({ id: 'item-1', listId: base.id, gameId: 1942, addedAt: base.createdAt }),
    ).toEqual({ id: 'item-1', listId: base.id, gameId: 1942, addedAt: base.createdAt });
  });

  it('throws for an invalid game id', () => {
    expect(() =>
      createListItem({ id: 'item-1', listId: base.id, gameId: 0, addedAt: base.createdAt }),
    ).toThrow(DomainValidationError);
  });
});
