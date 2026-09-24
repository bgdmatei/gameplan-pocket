import type { Game, Genre, LibraryEntry, Platform } from '@gameplan/domain';
import {
  CATALOG_TABLES,
  LIBRARY_ENTRY_TABLES,
  getGame,
  getLibraryEntryByGame,
  getReference,
} from '@gameplan/storage';
import { useEffect, useState } from 'react';
import { catalogApi } from '@/data/catalog-api';
import { useDatabase } from '@/data/database';
import { useQuery } from '@/data/use-query';
import { cacheGame } from './add-game';

export type GameDetail =
  | { kind: 'loading' }
  | {
      kind: 'ready';
      game: Game;
      entry: LibraryEntry | null;
      genres: Genre[];
      platforms: Platform[];
      /** False when the game came from the server but could not be kept on this phone. */
      cached: boolean;
    }
  /** Not on this phone, and the server could not be asked or does not know it. */
  | { kind: 'unavailable'; reason: 'offline' | 'not_found' | 'failed' };

/**
 * A game as the detail screen shows it: this phone's copy at once, and a
 * refresh from the server in the background. Opening a game caches it (or
 * refreshes its copy), which is what "viewed recently" means for pruning.
 */
export const useGameDetail = (gameId: number): GameDetail => {
  const adapter = useDatabase();
  const local = useQuery(
    async (db) => ({
      game: await getGame(db, gameId),
      entry: await getLibraryEntryByGame(db, gameId),
      reference: await getReference(db),
    }),
    [...CATALOG_TABLES, ...LIBRARY_ENTRY_TABLES],
    [gameId],
  );
  const [fetched, setFetched] = useState<
    | { kind: 'waiting' }
    | { kind: 'game'; game: Game }
    | { kind: 'unavailable'; reason: 'offline' | 'not_found' | 'failed' }
  >({ kind: 'waiting' });

  useEffect(() => {
    let current = true;
    setFetched({ kind: 'waiting' });
    void catalogApi.getGame(gameId).then(async (result) => {
      if (!current) return;
      if (result.kind === 'ok') {
        setFetched({ kind: 'game', game: result.value });
        await cacheGame(adapter, catalogApi, result.value, new Date().toISOString());
      } else if (result.kind !== 'superseded') {
        setFetched({ kind: 'unavailable', reason: result.kind });
      }
    });
    return () => {
      current = false;
    };
  }, [adapter, gameId]);

  if (local.status !== 'ready') return { kind: 'loading' };
  const { game, entry, reference } = local.data;

  if (game !== null) {
    return { kind: 'ready', game, entry, cached: true, ...reference };
  }
  if (fetched.kind === 'game') {
    return { kind: 'ready', game: fetched.game, entry, cached: false, ...reference };
  }
  if (fetched.kind === 'unavailable') return { kind: 'unavailable', reason: fetched.reason };
  return { kind: 'loading' };
};
