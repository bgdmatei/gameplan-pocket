import type { Op } from '../op/schema';

/** The reserved clock key holding the latest delete's clock (ADR-008). */
export const DELETE_CLOCK = '$delete';

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

  const newer = Object.entries(op.fields).filter(([field]) => {
    const current = state.clocks[field];
    return current === undefined || current < op.hlc;
  });
  // Nothing newer: hand back the same state, so callers can skip the write.
  if (newer.length === 0) return state;

  return {
    fields: { ...state.fields, ...Object.fromEntries(newer) },
    clocks: { ...state.clocks, ...Object.fromEntries(newer.map(([field]) => [field, op.hlc])) },
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

  return Object.entries(clocks).every(
    ([field, clock]) => field === DELETE_CLOCK || clock < deletedAt,
  );
};
