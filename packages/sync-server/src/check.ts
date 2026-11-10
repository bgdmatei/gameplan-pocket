import type { RejectionReason } from '@gameplan/contracts';
import { SYNC_LIMITS } from '@gameplan/contracts';
import { isTooFarAhead, opSchema } from '@gameplan/sync';
import type { Op, SyncedEntity } from '@gameplan/sync';

/**
 * Entities the server accepts. `note_conflict` waits for `notes-conflicts`
 * (module 10): no client creates one yet, and the phone can't apply one.
 */
export const SERVER_ENTITIES: ReadonlySet<SyncedEntity> = new Set([
  'library_entry',
  'entry_tag',
  'note_item',
  'list',
  'list_item',
]);

export type CheckResult =
  { ok: true; op: Op } | { ok: false; reason: RejectionReason; opId: string | undefined };

/**
 * Text Postgres can't store: U+0000 (refused by text and jsonb), and a lone
 * UTF-16 surrogate, half an emoji (refused by jsonb, silently replaced in
 * text). Either would fail after the door, on insert.
 */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

const unstorable = (text: string): boolean => text.includes('\u0000') || LONE_SURROGATE.test(text);

/** Whether any string in the value, key or leaf, holds unstorable text. */
const hasUnstorableText = (value: unknown): boolean => {
  if (typeof value === 'string') return unstorable(value);
  if (typeof value !== 'object' || value === null) return false;
  return Object.entries(value).some(([key, inner]) => unstorable(key) || hasUnstorableText(inner));
};

/** The op's id, if it has a usable one, so a rejection can name it. */
const idOf = (raw: unknown): string | undefined => {
  if (typeof raw !== 'object' || raw === null || !('id' in raw)) return undefined;
  const { id } = raw;
  return typeof id === 'string' && id.length <= SYNC_LIMITS.idMaxLength ? id : undefined;
};

/**
 * The door: whether one op may enter a user's log. The only place an op can
 * be refused safely, because nothing has seen it yet; once logged, every
 * merge must accept it (ADR-023).
 *
 * The op schema is the field allowlist (`SYNCED_FIELDS`), so a server-managed
 * column (`userId`, `deleted`, `fieldHlc`) fails it like any malformed value.
 * Nothing here says whose op it is: the caller takes the user from the token.
 */
export const checkOp = (raw: unknown, nowMs: number): CheckResult => {
  const parsed = opSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'invalid_op', opId: idOf(raw) };

  const op = parsed.data;
  // The op schema allows any row id; the server stores and snapshots it, and
  // the snapshot contract caps it, so a longer one would break every bootstrap.
  if (op.entityId.length > SYNC_LIMITS.idMaxLength) {
    return { ok: false, reason: 'invalid_op', opId: op.id };
  }
  if (hasUnstorableText(op)) {
    return { ok: false, reason: 'invalid_op', opId: op.id };
  }
  if (!SERVER_ENTITIES.has(op.entity)) {
    return { ok: false, reason: 'unsupported_entity', opId: op.id };
  }
  if (isTooFarAhead(op.hlc, nowMs)) return { ok: false, reason: 'clock_ahead', opId: op.id };

  return { ok: true, op };
};
