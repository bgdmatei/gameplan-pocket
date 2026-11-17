import type { Migration } from './types';

/** The developer's name in the catalog cache; catalog data, never synced. */
export const migration008: Migration = {
  number: 8,
  name: 'game-developer',
  statements: [`ALTER TABLE games ADD COLUMN developer TEXT`],
};
