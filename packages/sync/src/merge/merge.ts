import type { Op } from '../op/schema';

/** The reserved clock key holding the latest delete's clock (ADR-008). */
export const DELETE_CLOCK = '$delete';

/**
 * The reserved key holding the `baseHlc` of the edit whose note text won:
 * the version that text was written on top of (ADR-009).
 */
export const BASE_TEXT_CLOCK = '$base:text';

/** Reserved keys this build understands; a newer one is dropped like an unknown field (ADR-017). */
export const KNOWN_RESERVED = [DELETE_CLOCK, BASE_TEXT_CLOCK] as const;

/** Every clock key starting with `$` is reserved, never a field's clock. */
export const isReservedKey = (key: string): boolean => key.startsWith('$');

/**
 * One row as the merge sees it: field values by domain name, and the clock
 * that last set each one. `clocks` is what storage keeps as `field_hlc`.
 * Fields may be missing when ops arrive out of order; the merge does not care.
 */
export type RowState = {
  fields: Readonly<Record<string, unknown>>;
  clocks: Readonly<Record<string, string>>;
};

export const EMPTY_ROW: RowState = { fields: {}, clocks: {} };

/** The clocks of fields only. The one way to read field clocks, so no reserved key passes for a field. */
export const fieldClocks = (clocks: RowState['clocks']): Record<string, string> =>
  Object.fromEntries(Object.entries(clocks).filter(([key]) => !isReservedKey(key)));

/** Sets the text's base, or drops it when the winning text edit had none. */
export const withTextBase = (
  clocks: Record<string, string>,
  base: string | undefined,
): Record<string, string> => {
  const rest = Object.fromEntries(
    Object.entries(clocks).filter(([key]) => key !== BASE_TEXT_CLOCK),
  );
  return base === undefined ? rest : { ...rest, [BASE_TEXT_CLOCK]: base };
};

/**
 * Applies one op to one row: per-field last-writer-wins by clock.
 *
 * Pure and total. It accepts ops in any order, for rows it has never seen,
 * and never checks domain rules: two valid edits can merge into a state no
 * single edit could reach, and rejecting it would split devices apart
 * (SPEC-domain-model.md §Merge safety). An op whose clock equals the stored
 * one is a redelivery and changes nothing.
 */
export const mergeOp = (state: RowState, op: Op): RowState => {
  if (op.type === 'delete') {
    const current = state.clocks[DELETE_CLOCK];
    if (current !== undefined && current >= op.hlc) return state;
    return { fields: state.fields, clocks: { ...state.clocks, [DELETE_CLOCK]: op.hlc } };
  }

  const held = fieldClocks(state.clocks);
  const newer = Object.entries(op.fields).filter(([field]) => {
    const current = held[field];
    return current === undefined || current < op.hlc;
  });
  // Nothing newer: hand back the same state, so callers can skip the write.
  if (newer.length === 0) return state;

  const clocks = {
    ...state.clocks,
    ...Object.fromEntries(newer.map(([field]) => [field, op.hlc])),
  };
  const textWon = newer.some(([field]) => field === 'text');
  return {
    fields: { ...state.fields, ...Object.fromEntries(newer) },
    clocks: op.entity === 'note_item' && textWon ? withTextBase(clocks, op.baseHlc) : clocks,
  };
};

/**
 * Merges a whole row from elsewhere (a snapshot) into this one: per field,
 * the newer clock wins, exactly as if every op behind `remote` were applied
 * with `mergeOp`. Returns `local` itself when nothing is newer.
 */
export const mergeRow = (local: RowState, remote: RowState): RowState => {
  const isNewer = (key: string, clock: string): boolean => {
    const current = local.clocks[key];
    return current === undefined || current < clock;
  };
  const newer = Object.entries(fieldClocks(remote.clocks)).filter(([field, clock]) =>
    isNewer(field, clock),
  );
  const deletedAt = remote.clocks[DELETE_CLOCK];
  const deleteWon = deletedAt !== undefined && isNewer(DELETE_CLOCK, deletedAt);
  if (newer.length === 0 && !deleteWon) return local;

  const fields = { ...local.fields };
  for (const [field] of newer) fields[field] = remote.fields[field] ?? null;

  const clocks = {
    ...local.clocks,
    ...Object.fromEntries(newer),
    ...(deleteWon && { [DELETE_CLOCK]: deletedAt }),
  };
  const textWon = newer.some(([field]) => field === 'text');
  return {
    fields,
    clocks: textWon ? withTextBase(clocks, remote.clocks[BASE_TEXT_CLOCK]) : clocks,
  };
};

/**
 * A row is deleted when its latest delete is newer than every field's clock.
 * A delete beats every edit made before it; an edit made after it brings the
 * row back, because that edit was deliberate and dropping it would lose a
 * user action (SPEC-sync-core.md §Merge, decided 2026-09-23).
 */
export const isDeleted = (clocks: RowState['clocks']): boolean => {
  const deletedAt = clocks[DELETE_CLOCK];
  if (deletedAt === undefined) return false;

  return Object.values(fieldClocks(clocks)).every((clock) => clock < deletedAt);
};
