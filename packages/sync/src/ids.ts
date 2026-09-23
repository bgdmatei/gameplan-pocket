import { tagIdentityKey } from '@gameplan/domain';
import { v5, v7 } from 'uuid';

/**
 * Supplied by the app (expo-crypto on the phone, a seeded generator in tests),
 * so this package reads no platform crypto and every test run can be replayed.
 */
export type RandomBytes = (length: number) => Uint8Array;

/**
 * Fixed namespaces for deterministic ids (ADR-006). Changing either one gives
 * every existing entry or tag a new id on the next write, and devices would
 * stop agreeing which row is which: never change them.
 */
const ENTRY_NAMESPACE = '1f4dc284-da8c-4ffc-baa5-a87024213a1b';
const TAG_NAMESPACE = '1bb4794b-51b4-444e-878b-7b9025e933d0';

/** A time-ordered id for an op or a user-created row (UUIDv7). */
export const newId = (randomBytes: RandomBytes, nowMs: number): string =>
  v7({ random: randomBytes(16), msecs: nowMs });

/**
 * A library entry's id comes from its game alone, so the same game added
 * offline on two devices becomes one row. Unique within one user's data; the
 * server keys user tables on (user_id, id).
 */
export const entryId = (gameId: number): string => v5(String(gameId), ENTRY_NAMESPACE);

/** The same tag added to the same entry on two devices becomes one row. */
export const tagId = (entryIdValue: string, tag: string): string =>
  v5(tagIdentityKey(entryIdValue, tag), TAG_NAMESPACE);

/** This device's name in every clock it issues: 16 lowercase hex characters. */
export const newNodeId = (randomBytes: RandomBytes): string =>
  Array.from(randomBytes(8), (byte) => byte.toString(16).padStart(2, '0')).join('');
