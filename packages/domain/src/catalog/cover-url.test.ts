import { describe, expect, it } from 'vitest';
import { coverUrl } from './cover-url';

describe('coverUrl', () => {
  it('builds a sized IGDB url, and nothing when there is no cover', () => {
    expect(coverUrl('co1wyy', 'cover_big')).toBe(
      'https://images.igdb.com/igdb/image/upload/t_cover_big/co1wyy.jpg',
    );
    expect(coverUrl(null, 'thumb')).toBeNull();
  });
});
