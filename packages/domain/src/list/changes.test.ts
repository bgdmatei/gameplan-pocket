import { describe, expect, it } from 'vitest';
import { DomainValidationError } from '../shared/errors';
import { applyListChange, createList, createListItem } from './changes';

const NOW = '2026-09-18T10:00:00Z';
const list = createList({ id: 'list-1', name: 'Best of 2026', createdAt: NOW });

describe('lists', () => {
  it('trims what it stores and treats blank description as none', () => {
    const created = createList({
      id: 'l',
      name: '  Co-op  ',
      description: '   ',
      createdAt: NOW,
    });

    expect(created).toMatchObject({ name: 'Co-op', description: null });
  });

  it('reports only real changes', () => {
    expect(applyListChange(list, { name: '  Best of 2026  ' }).changed).toEqual({});
    expect(applyListChange(list, { name: 'Best of 2027' }).changed).toEqual({
      name: 'Best of 2027',
    });
  });

  it('refuses an empty name', () => {
    expect(() => applyListChange(list, { name: '  ' })).toThrow(DomainValidationError);
  });

  it('holds any catalog game, not only ones in the library', () => {
    expect(createListItem({ id: 'i', listId: 'list-1', gameId: 404, addedAt: NOW })).toMatchObject({
      gameId: 404,
    });
  });
});
