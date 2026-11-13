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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A full release date ("12 Feb 2019"), for a game's About card. Read from the
 * string, never through `Date`: a date-only ISO parses as UTC midnight, which
 * shows as the day before anywhere west of Greenwich.
 */
export const releaseDate = (isoDate: string | null): string | null => {
  if (isoDate === null) return null;
  const [year, month, day] = isoDate.slice(0, 10).split('-');
  const name = MONTHS[Number(month) - 1];
  if (year === undefined || name === undefined || day === undefined) return isoDate;
  return `${String(Number(day))} ${name} ${year}`;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (time: number): number => new Date(time).setHours(0, 0, 0, 0);

const ago = (count: number, unit: string): string =>
  `${String(count)} ${unit}${count === 1 ? '' : 's'} ago`;

/**
 * How long ago a timestamp was, in calendar days on the phone's clock: an edit
 * last night is "Yesterday" even if it was an hour ago. Coarse on purpose; the
 * shelf only needs to say which games have gone quiet.
 */
export const timeSince = (iso: string, now: number): string => {
  // Rounded, so a day that DST makes 23 or 25 hours long still counts as one.
  const days = Math.round((startOfDay(now) - startOfDay(Date.parse(iso))) / DAY_MS);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return ago(days, 'day');
  if (days < 30) return ago(Math.floor(days / 7), 'week');
  // Capped, or the last days before a year read "12 months ago".
  if (days < 365) return ago(Math.min(11, Math.floor(days / 30)), 'month');
  return ago(Math.floor(days / 365), 'year');
};
