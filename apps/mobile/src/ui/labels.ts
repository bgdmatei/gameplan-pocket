import type { EntryStatus } from '@gameplan/domain';

/** How each status reads on screen; always shown with its colour, never instead of it. */
export const STATUS_LABEL: Record<EntryStatus, string> = {
  wishlist: 'Wishlist',
  backlog: 'Backlog',
  playing: 'Playing',
  paused: 'Paused',
  completed: 'Completed',
  dropped: 'Dropped',
};

/** The year from an ISO date, for list rows. */
export const releaseYear = (isoDate: string | null): string | null =>
  isoDate === null ? null : isoDate.slice(0, 4);
