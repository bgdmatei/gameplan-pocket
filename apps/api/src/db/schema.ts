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

/** Set by the database on insert. */
type CreatedAt = ColumnType<Date, Date | string | undefined, never>;
/** A required time the code supplies. */
type Timestamp = ColumnType<Date, Date | string, Date | string>;
/** An optional time, empty until something happens. */
type MaybeTimestamp = ColumnType<
  Date | null,
  Date | string | null | undefined,
  Date | string | null
>;

export type UsersTable = {
  id: Generated<string>;
  email: string;
  created_at: CreatedAt;
};

export type AuthIdentitiesTable = {
  /** `email` today; `apple` and `google` later (decision 1). */
  provider: string;
  /** The provider's id for the person: the email itself for `email`. */
  subject: string;
  user_id: string;
  created_at: CreatedAt;
};

export type AuthCodesTable = {
  id: Generated<string>;
  email: string;
  code_hmac: string;
  expires_at: Timestamp;
  attempts: Generated<number>;
  used_at: MaybeTimestamp;
  created_at: CreatedAt;
};

export type AuthFailuresTable = {
  id: Generated<string>;
  email: string;
  failed_at: ColumnType<Date, Date | string | undefined, never>;
};

export type DevicesTable = {
  id: Generated<string>;
  user_id: string;
  node_id: string;
  platform: string;
  app_version: string;
  created_at: CreatedAt;
  last_seen_at: ColumnType<Date, Date | string | undefined, Date | string>;
};

export type RefreshTokensTable = {
  id: Generated<string>;
  user_id: string;
  device_id: string;
  family_id: string;
  token_hash: string;
  expires_at: Timestamp;
  used_at: MaybeTimestamp;
  replaced_by: ColumnType<string | null, string | null | undefined, string | null>;
  revoked_at: MaybeTimestamp;
  created_at: CreatedAt;
};

export type Database = {
  games: GamesTable;
  genres: GenresTable;
  platforms: PlatformsTable;
  search_cache: SearchCacheTable;
  users: UsersTable;
  auth_identities: AuthIdentitiesTable;
  auth_codes: AuthCodesTable;
  auth_failures: AuthFailuresTable;
  devices: DevicesTable;
  refresh_tokens: RefreshTokensTable;
};
