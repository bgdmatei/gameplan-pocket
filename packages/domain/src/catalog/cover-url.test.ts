import { describe, expect, it } from 'vitest';
import { coverUrl } from './cover-url';

describe('coverUrl', () => {
  it.each([
    ['thumb', 'https://images.igdb.com/igdb/image/upload/t_thumb/co1wyy.jpg'],
    ['cover_small', 'https://images.igdb.com/igdb/image/upload/t_cover_small/co1wyy.jpg'],
    ['cover_big', 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1wyy.jpg'],
    ['720p', 'https://images.igdb.com/igdb/image/upload/t_720p/co1wyy.jpg'],
  ] as const)('builds a %s url', (size, expected) => {
    expect(coverUrl('co1wyy', size)).toBe(expected);
  });

  it('returns null when the game has no cover', () => {
    expect(coverUrl(null, 'thumb')).toBeNull();
  });
});
