import { DomainValidationError, applyEntryChange, createEntry } from '@gameplan/domain';
import type { EntryStatus, Game } from '@gameplan/domain';
import { getGame, getLibraryEntryByGame, getReference, upsertGames } from '@gameplan/storage';
import type { StorageAdapter } from '@gameplan/storage';
import { commitLocalCreate, commitLocalEdit, entryId } from '@gameplan/sync';
import type { SyncEnv } from '@gameplan/sync';
import type { CatalogApi } from '@/data/api';

export type ReferenceSource = Pick<CatalogApi, 'getReference'>;

/**
 * Keeps a game on this phone, so it shows offline and local search finds it
 * (plan §4: the phone caches games in the library or viewed recently).
 *
 * The phone's tables refuse a game whose genres or platforms it has not
 * cached, so when the game names one it doesn't know, the reference lists are
 * fetched first and written in the same transaction. Returns `false` when that
 * fetch is needed and fails: the game is shown but not kept.
 */
export const cacheGame = async (
  adapter: StorageAdapter,
  source: ReferenceSource,
  game: Game,
  fetchedAt: string,
): Promise<boolean> => {
  const known = await getReference(adapter);
  const genreIds = new Set(known.genres.map((genre) => genre.id));
  const platformIds = new Set(known.platforms.map((platform) => platform.id));
  const complete =
    game.genreIds.every((id) => genreIds.has(id)) &&
    game.platformIds.every((id) => platformIds.has(id));

  if (complete) {
    await upsertGames(adapter, { games: [game], fetchedAt });
    return true;
  }

  const fetched = await source.getReference();
  if (fetched.kind !== 'ok') return false;

  // A game may still name an id the server's lists lack (IGDB added one since
  // the server cached them). Keep the ids we can store rather than lose the game.
  const genres = new Set(fetched.value.genres.map((genre) => genre.id));
  const platforms = new Set(fetched.value.platforms.map((platform) => platform.id));
  await upsertGames(adapter, {
    games: [
      {
        ...game,
        genreIds: game.genreIds.filter((id) => genres.has(id)),
        platformIds: game.platformIds.filter((id) => platforms.has(id)),
      },
    ],
    genres: fetched.value.genres,
    platforms: fetched.value.platforms,
    fetchedAt,
  });
  return true;
};

export type AddResult = 'added' | 'restored' | 'already';

/**
 * Puts a cached game in the library. The entry's id comes from the game's id,
 * so the same game added on two offline devices becomes one row (ADR-006).
 *
 * Games are archived, never deleted: adding an archived game brings the same
 * row back with its rating, dates and notes, and ignores the chosen status
 * and platform.
 *
 * A new entry needs the platform it's played on, one of the game's own,
 * whenever the catalog lists any (SPEC-mobile-library.md decision 18).
 *
 * @throws {DomainValidationError} when the platform is missing or not one of
 * the game's, writing nothing.
 */
export const addGame = async (
  adapter: StorageAdapter,
  env: SyncEnv,
  {
    gameId,
    status,
    today,
    platformId = null,
  }: { gameId: number; status: EntryStatus; today: string; platformId?: number | null },
): Promise<AddResult> => {
  const existing = await getLibraryEntryByGame(adapter, gameId);

  if (existing !== null) {
    if (!existing.archived) return 'already';
    await commitLocalEdit(adapter, env, {
      entity: 'library_entry',
      id: existing.id,
      update: (current) => applyEntryChange(current, { archived: false }, { today }),
    });
    return 'restored';
  }

  const gamePlatformIds = (await getGame(adapter, gameId))?.platformIds ?? [];
  if (platformId === null && gamePlatformIds.length > 0) {
    throw new DomainValidationError([
      { code: 'invalid_field', field: 'platform', message: 'Pick the platform you play it on.' },
    ]);
  }

  const next = createEntry(
    {
      id: entryId(gameId),
      gameId,
      status,
      platformId,
      createdAt: new Date(env.now()).toISOString(),
    },
    { today, gamePlatformIds },
  );
  await commitLocalCreate(adapter, env, { entity: 'library_entry', next });
  return 'added';
};
