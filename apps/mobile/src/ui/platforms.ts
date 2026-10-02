import type { Platform } from '@gameplan/domain';

/**
 * The platforms most players pick from, in the order they look for them, by
 * IGDB id, with the names people use for them. Anything else follows in the
 * catalog's order under its own abbreviation.
 */
const PREFERRED: readonly { id: number; label: string }[] = [
  { id: 130, label: 'Switch' },
  { id: 508, label: 'Switch 2' },
  { id: 6, label: 'PC' },
  { id: 48, label: 'PS4' },
  { id: 167, label: 'PS5' },
  { id: 49, label: 'Xbox One' },
  { id: 169, label: 'Xbox Series' },
];

/** IGDB abbreviations that read badly as they are. */
const RENAMED: Readonly<Record<string, string>> = {
  famicom: 'Famicom',
  fds: 'FDS',
  WiiU: 'Wii U',
};

const rank = (platform: Platform): number => {
  const index = PREFERRED.findIndex((preferred) => preferred.id === platform.id);
  return index === -1 ? PREFERRED.length : index;
};

/** A stable sort: platforms outside the preferred list keep their relative order. */
export const orderPlatforms = (platforms: readonly Platform[]): Platform[] =>
  [...platforms].sort((a, b) => rank(a) - rank(b));

export const platformLabel = (platform: Platform): string => {
  const preferred = PREFERRED.find((candidate) => candidate.id === platform.id)?.label;
  if (preferred !== undefined) return preferred;
  if (platform.abbreviation === null) return platform.name;
  return RENAMED[platform.abbreviation] ?? platform.abbreviation;
};
