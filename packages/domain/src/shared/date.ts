import { z } from 'zod';

/**
 * Calendar date (`YYYY-MM-DD`), no timezone: the user enters days, not
 * instants. zod validates the calendar itself, so `2026-02-30` is rejected.
 */
export const isoDateSchema = z.iso.date();

/** Instant (`YYYY-MM-DDTHH:mm:ssZ`), used for `createdAt`-style fields. */
export const isoDateTimeSchema = z.iso.datetime();

export type IsoDate = z.infer<typeof isoDateSchema>;
export type IsoDateTime = z.infer<typeof isoDateTimeSchema>;

/**
 * Chronological comparator. Zero-padded ISO dates sort correctly as strings,
 * so no Date parsing (and no timezone) is involved.
 */
export const compareIsoDate = (a: IsoDate, b: IsoDate): number => {
  if (a === b) return 0;
  return a < b ? -1 : 1;
};
