import type { ColumnType, Generated } from 'kysely';

/** When a row was fetched: set by the database, read back as a `Date`. */
type FetchedAt = ColumnType<Date, Date | string | undefined, Date | string>;

export type GamesTable = {
  /** The IGDB id. */
  id: number;
  name: string;
  slug: string;
  summary: string | null;
  /** `YYYY-MM-DD`; the client returns DATE columns as text, never a `Date`. */
  first_release_date: string | null;
  cover_image_id: string | null;
  genre_ids: number[];
  platform_ids: number[];
  fetched_at: FetchedAt;
  /** Bumped on every upsert, so a later `/catalog/changes` can page by it. */
  catalog_version: Generated<number>;
};

export type GenresTable = { id: number; name: string; slug: string; fetched_at: FetchedAt };

export type PlatformsTable = {
  id: number;
  name: string;
  abbreviation: string | null;
  fetched_at: FetchedAt;
};

export type SearchCacheTable = {
  /** Normalised query text. */
  query: string;
  /** Result ids in rank order. */
  game_ids: number[];
  fetched_at: FetchedAt;
};

export type Database = {
  games: GamesTable;
  genres: GenresTable;
  platforms: PlatformsTable;
  search_cache: SearchCacheTable;
};
