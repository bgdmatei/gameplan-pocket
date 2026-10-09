import { describe, expect, it } from 'vitest';
import {
  STEAM_DECK_PLATFORM_ID,
  hasPlayablePlatform,
  playablePlatformIds,
} from './playable-platforms';

const PC = 6;
const LINUX = 3;
const MAC = 14;
const BROWSER = 82;
const PS5 = 167;

describe('playablePlatformIds', () => {
  it.each([
    { catalog: [PC, PS5], playable: [PC, PS5, STEAM_DECK_PLATFORM_ID] },
    { catalog: [LINUX], playable: [STEAM_DECK_PLATFORM_ID] },
    { catalog: [PC, LINUX, MAC], playable: [PC, STEAM_DECK_PLATFORM_ID] },
    { catalog: [MAC], playable: [] },
    { catalog: [BROWSER, PC], playable: [PC, STEAM_DECK_PLATFORM_ID] },
    { catalog: [PS5], playable: [PS5] },
    { catalog: [], playable: [] },
  ])('$catalog → $playable', ({ catalog, playable }) => {
    expect(playablePlatformIds(catalog)).toEqual(playable);
  });
});

describe('hasPlayablePlatform', () => {
  // Search hides only games with nowhere left to play them; a Linux-only game
  // stays, as Steam Deck, and an unreleased game with no platforms stays too.
  it.each([
    { catalog: [BROWSER], offered: false },
    { catalog: [MAC], offered: false },
    { catalog: [BROWSER, MAC], offered: false },
    { catalog: [LINUX], offered: true },
    { catalog: [BROWSER, PS5], offered: true },
    { catalog: [], offered: true },
  ])('$catalog → $offered', ({ catalog, offered }) => {
    expect(hasPlayablePlatform(catalog)).toBe(offered);
  });
});
