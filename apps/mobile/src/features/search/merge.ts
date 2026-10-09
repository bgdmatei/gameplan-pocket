import { hasPlayablePlatform } from '@gameplan/domain';
import type { Game, GameWithEntry } from '@gameplan/domain';
import type { ApiResult } from '@/data/api';

/** The server's side of a search: not asked yet, in flight, or answered. */
export type RemoteSearch = { kind: 'waiting' } | ApiResult<Game[]>;

/** What the search screen says under the results, if anything. */
export type SearchNotice = 'offline' | 'incomplete' | null;

export type MergedSearch = { rows: GameWithEntry[]; notice: SearchNotice };

/**
 * One list from what this phone has and what the server found.
 *
 * Local results come first, in their own order and with the player's library
 * status, because they are already on screen when the server answers and must
 * not jump. Games only the server knows follow in its ranking. The server
 * never tells us about the player's library, so those have no entry: a game in
 * the library is always cached locally, which is where its entry comes from.
 *
 * Games with no playable platform (browser-only, Mac-only) are left out,
 * unless already in the library: a game the player added stays findable.
 */
export const mergeSearch = (
  local: readonly GameWithEntry[],
  remote: RemoteSearch,
): MergedSearch => {
  const known = new Set(local.map((row) => row.game.id));
  const offered = local.filter(
    (row) => row.entry !== null || hasPlayablePlatform(row.game.platformIds),
  );
  const found =
    remote.kind === 'ok'
      ? remote.value
          .filter((game) => !known.has(game.id) && hasPlayablePlatform(game.platformIds))
          .map((game) => ({ game, entry: null }))
      : [];

  const notice: SearchNotice =
    remote.kind === 'offline'
      ? 'offline'
      : remote.kind === 'failed' || (remote.kind === 'ok' && remote.stale)
        ? 'incomplete'
        : null;

  return { rows: [...offered, ...found], notice };
};
