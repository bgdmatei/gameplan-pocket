import { describe, expect, it } from 'vitest';
import { compareListItems, listItemSchema, listSchema } from './schema';
import type { List, ListItem } from './schema';

const list: List = {
  id: 'list-1',
  name: 'Best of 2025',
  description: null,
  createdAt: '2026-09-18T10:00:00Z',
};

const item: ListItem = {
  id: 'item-1',
  listId: 'list-1',
  gameId: 1942,
  addedAt: '2026-09-18T10:00:00Z',
};

describe('listSchema', () => {
  it('accepts a list with and without a description', () => {
    expect(listSchema.safeParse(list).success).toBe(true);
    expect(listSchema.safeParse({ ...list, description: 'Games I loved' }).success).toBe(true);
  });

  it('trims the name and description', () => {
    const parsed = listSchema.parse({ ...list, name: '  Co-op  ', description: '  With Ana  ' });
    expect(parsed).toMatchObject({ name: 'Co-op', description: 'With Ana' });
  });

  it('turns a blank description into null', () => {
    expect(listSchema.parse({ ...list, description: '   ' }).description).toBeNull();
  });

  it.each([
    ['empty name', { name: '' }],
    ['whitespace-only name', { name: '   ' }],
    ['name over 100 characters', { name: 'a'.repeat(101) }],
    ['description over 500 characters', { description: 'a'.repeat(501) }],
    ['missing id', { id: '' }],
    ['bad timestamp', { createdAt: '2026-09-18' }],
  ])('rejects %s', (_label, patch) => {
    expect(listSchema.safeParse({ ...list, ...patch }).success).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(listSchema.safeParse({ ...list, public: true }).success).toBe(false);
  });
});

describe('listItemSchema', () => {
  it('accepts a catalog game', () => {
    expect(listItemSchema.safeParse(item).success).toBe(true);
  });

  it.each([
    ['missing list', { listId: '' }],
    ['game id of zero', { gameId: 0 }],
    ['negative game id', { gameId: -3 }],
    ['fractional game id', { gameId: 1.5 }],
    ['bad timestamp', { addedAt: 'today' }],
  ])('rejects %s', (_label, patch) => {
    expect(listItemSchema.safeParse({ ...item, ...patch }).success).toBe(false);
  });
});

describe('compareListItems', () => {
  it('orders by when the game was added, oldest first', () => {
    const older = { ...item, addedAt: '2026-01-01T00:00:00Z' };
    const newer = { ...item, addedAt: '2026-02-01T00:00:00Z' };
    expect(compareListItems(older, newer)).toBeLessThan(0);
    expect(compareListItems(newer, older)).toBeGreaterThan(0);
    expect(compareListItems(older, { ...older })).toBe(0);
  });
});
