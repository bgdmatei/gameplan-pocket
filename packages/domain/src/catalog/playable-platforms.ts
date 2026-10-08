/**
 * Steam Deck isn't an IGDB platform: Deck games are catalogued as PC or
 * Linux. It gets a reserved id far above IGDB's own (which count up from 1),
 * so it never names a catalog platform (spec decision 20).
 */
export const STEAM_DECK_PLATFORM_ID = 1_000_000_001;

const PC = 6;
const LINUX = 3;
const MAC = 14;

/** Catalog platforms never offered as a choice: Linux is covered by Steam Deck. */
const HIDDEN: ReadonlySet<number> = new Set([LINUX, MAC]);

/**
 * The platforms a game can be added and played on, from the catalog's list:
 * Mac and Linux are left out, and Steam Deck is added for any game that runs
 * on PC or Linux. Adding and editing an entry validate against this list.
 */
export const playablePlatformIds = (catalogIds: readonly number[]): number[] => {
  const playable = catalogIds.filter((id) => !HIDDEN.has(id));
  return catalogIds.includes(PC) || catalogIds.includes(LINUX)
    ? [...playable, STEAM_DECK_PLATFORM_ID]
    : playable;
};
