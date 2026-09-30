import type { EntryStatus, NoteItemType } from '@gameplan/domain';

/** How each status reads on screen; always shown with its colour, never instead of it. */
export const STATUS_LABEL: Record<EntryStatus, string> = {
  wishlist: 'Wishlist',
  backlog: 'Backlog',
  playing: 'Playing',
  paused: 'Paused',
  completed: 'Completed',
  dropped: 'Dropped',
};

export const NOTE_TYPE_LABEL: Record<NoteItemType, string> = {
  puzzle: 'Puzzle',
  secret: 'Secret',
  npc_hint: 'NPC hint',
  other: 'Other',
};

/** The year from an ISO date, for list rows. */
export const releaseYear = (isoDate: string | null): string | null =>
  isoDate === null ? null : isoDate.slice(0, 4);
