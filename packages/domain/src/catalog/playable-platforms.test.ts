import { describe, expect, it } from 'vitest';
import { STEAM_DECK_PLATFORM_ID, playablePlatformIds } from './playable-platforms';

const PC = 6;
const LINUX = 3;
const MAC = 14;
const PS5 = 167;

describe('playablePlatformIds', () => {
  it.each([
    { catalog: [PC, PS5], playable: [PC, PS5, STEAM_DECK_PLATFORM_ID] },
    { catalog: [LINUX], playable: [STEAM_DECK_PLATFORM_ID] },
    { catalog: [PC, LINUX, MAC], playable: [PC, STEAM_DECK_PLATFORM_ID] },
    { catalog: [MAC], playable: [] },
    { catalog: [PS5], playable: [PS5] },
    { catalog: [], playable: [] },
  ])('$catalog → $playable', ({ catalog, playable }) => {
    expect(playablePlatformIds(catalog)).toEqual(playable);
  });
});
