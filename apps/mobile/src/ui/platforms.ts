import { STEAM_DECK_PLATFORM_ID, playablePlatformIds } from '@gameplan/domain';
import type { Platform } from '@gameplan/domain';

/** Not in the catalog (see `STEAM_DECK_PLATFORM_ID`), so the app names it itself. */
const STEAM_DECK: Platform = { id: STEAM_DECK_PLATFORM_ID, name: 'Steam Deck', abbreviation: 'SD' };

/**
 * The platforms most players pick from, in the order they look for them, by
 * IGDB id. Anything else follows in the catalog's order.
 */
const PREFERRED: readonly number[] = [130, 508, 6, STEAM_DECK_PLATFORM_ID, 48, 167, 49, 169];

/** Short labels, by IGDB id, so a chip on a cover stays a few characters (spec decision 20). */
const SHORT: Readonly<Record<number, string>> = {
  7: 'PS1',
  8: 'PS2',
  9: 'PS3',
  48: 'PS4',
  167: 'PS5',
  38: 'PSP',
  46: 'VITA',
  11: 'XBOX',
  12: 'X360',
  49: 'XB1',
  169: 'XSX',
  130: 'NSW',
  508: 'NS2',
  5: 'WII',
  41: 'WIIU',
  21: 'NGC',
  4: 'N64',
  19: 'SNES',
  18: 'NES',
  37: '3DS',
  20: 'NDS',
  24: 'GBA',
  22: 'GBC',
  33: 'GB',
  6: 'PC',
  [STEAM_DECK_PLATFORM_ID]: 'SD',
  39: 'iOS',
  34: 'AND',
};

/** Any other platform: the catalog's abbreviation (or name), cut to five characters. */
const LABEL_MAX = 5;

const rank = (platform: Platform): number => {
  const index = PREFERRED.indexOf(platform.id);
  return index === -1 ? PREFERRED.length : index;
};

/** A stable sort: platforms outside the preferred list keep their relative order. */
export const orderPlatforms = (platforms: readonly Platform[]): Platform[] =>
  [...platforms].sort((a, b) => rank(a) - rank(b));

export const platformLabel = (platform: Platform): string =>
  SHORT[platform.id] ?? (platform.abbreviation ?? platform.name).slice(0, LABEL_MAX);

/**
 * The platforms a game can be played on (`playablePlatformIds`: no Mac or
 * Linux, plus Steam Deck), as `Platform`s from the phone's reference list, in
 * the app's order. An id the phone has no name for is left out.
 */
export const playablePlatforms = (
  catalogIds: readonly number[],
  known: readonly Platform[],
): Platform[] => {
  const byId = new Map(known.map((platform) => [platform.id, platform]));
  byId.set(STEAM_DECK.id, STEAM_DECK);
  return orderPlatforms(
    playablePlatformIds(catalogIds).flatMap((id) => {
      const platform = byId.get(id);
      return platform === undefined ? [] : [platform];
    }),
  );
};

/**
 * An entry's platform, Steam Deck included, or null when it has none or the
 * phone can't name it. Show `platformLabel` of it; let VoiceOver read its
 * `name`, since short labels like "XSX" are spelled out letter by letter.
 */
export const platformById = (id: number | null, known: readonly Platform[]): Platform | null => {
  if (id === null) return null;
  if (id === STEAM_DECK.id) return STEAM_DECK;
  return known.find((candidate) => candidate.id === id) ?? null;
};
