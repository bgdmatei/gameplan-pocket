import type { LibraryEntry } from '../library-entry/schema';
import type { Game } from './schema';

/**
 * How every screen shows a game: the catalog row plus the user's own entry, if
 * they have one. There is at most one entry per game, so a status or rating
 * change appears everywhere that game is listed — search results, game detail,
 * custom lists and the library grid all read the same entry.
 *
 * `entry: null` means "not in my library", so the screen offers *Add*.
 *
 * The join itself is a query (`storage-adapter`); domain fixes only the shape.
 */
export type GameWithEntry = { game: Game; entry: LibraryEntry | null };

export const isInLibrary = (view: GameWithEntry): boolean => view.entry !== null;
