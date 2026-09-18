/** Drops keys explicitly set to `undefined` so they read as "not supplied". */
export const definedEntries = <T extends object>(value: T): [string, unknown][] =>
  Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined);

/** Structural comparison, so object fields differ by contents, not reference. */
export const isSameValue = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  return (
    keysA.length === keysB.length &&
    keysA.every((key) => isSameValue((a as never)[key], (b as never)[key]))
  );
};

/**
 * Fields of `next` that really differ from `current`, minus the ones that are
 * never patchable. This is what `sync-core` sends as a `set` op, so a no-op
 * edit yields `{}` and no op at all.
 */
export const diffFields = <T extends object, C>(
  current: T,
  next: T,
  skip: Readonly<Record<string, true>>,
): C =>
  Object.fromEntries(
    definedEntries(next).filter(
      ([field, value]) => !(field in skip) && !isSameValue(value, (current as never)[field]),
    ),
  ) as C;
