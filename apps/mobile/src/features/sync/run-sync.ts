import { CATALOG_LIMITS } from '@gameplan/contracts';
import { listUncachedGameIds } from '@gameplan/storage';
import type { StorageAdapter } from '@gameplan/storage';
import { syncOnce } from '@gameplan/sync';
import type { SyncDeps, SyncResult } from '@gameplan/sync';
import type { CatalogApi } from '../../data/api';
import { cacheGames } from '../library/add-game';

export type GameSource = Pick<CatalogApi, 'getGames' | 'getReference'>;

/**
 * Caches the games a pull brought entries for, a batch per catalog call, each
 * uncached id asked for once per sync. The catalog is a bonus: a failed fetch
 * leaves the rest for the next sync, and an id the server doesn't know is
 * passed over rather than asked for again.
 */
export const fetchUncachedGames = async (
  adapter: StorageAdapter,
  catalog: GameSource,
  fetchedAt: string,
): Promise<number> => {
  let cached = 0;
  let after = 0;
  for (;;) {
    const ids = await listUncachedGameIds(adapter, { after, limit: CATALOG_LIMITS.batchMaxIds });
    const last = ids.at(-1);
    if (last === undefined) return cached;
    const answer = await catalog.getGames(ids);
    if (answer.kind !== 'ok') return cached;
    // Only what was asked for: anything else would never leave the list.
    const wanted = new Set(ids);
    const games = answer.value.filter((game) => wanted.has(game.id));
    if (games.length > 0 && !(await cacheGames(adapter, catalog, games, fetchedAt))) {
      return cached;
    }
    cached += games.length;
    after = last;
  }
};

/**
 * One sync, then the games its pull named: their entries show only once
 * cached. The sync has committed by then, so a failure caching games is
 * logged, not thrown; the next sync tries them again.
 */
export const runSync = async (
  deps: SyncDeps & { catalog: GameSource },
): Promise<SyncResult & { games: number }> => {
  const result = await syncOnce(deps);
  const fetchedAt = new Date(deps.env.now()).toISOString();
  try {
    return { ...result, games: await fetchUncachedGames(deps.adapter, deps.catalog, fetchedAt) };
  } catch (error) {
    console.warn('Caching synced games failed:', error instanceof Error ? error.name : 'unknown');
    return { ...result, games: 0 };
  }
};
