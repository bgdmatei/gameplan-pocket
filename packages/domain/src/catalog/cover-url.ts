/**
 * IGDB serves images by size template, so a grid can fetch thumbnails while a
 * detail screen fetches the large version. Bytes are never proxied through our
 * API; only the image id is stored (plan §8.2).
 */
export const COVER_SIZES = ['thumb', 'cover_small', 'cover_big', '720p'] as const;

export type CoverSize = (typeof COVER_SIZES)[number];

/** `null` when the game has no cover, so callers show a placeholder. */
export const coverUrl = (imageId: string | null, size: CoverSize): string | null =>
  imageId === null ? null : `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg`;
