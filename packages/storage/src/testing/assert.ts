/**
 * Assertions with no test-framework dependency, so the adapter cases can run
 * anywhere: in Vitest on CI, and inside the app on a real device, where no
 * test runner exists.
 */

export class AssertionFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertionFailed';
  }
}

const show = (value: unknown): string => {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

export const assertEqual = (actual: unknown, expected: unknown, what: string): void => {
  if (show(actual) !== show(expected)) {
    throw new AssertionFailed(`${what}: expected ${show(expected)}, got ${show(actual)}`);
  }
};

export const assertTrue = (value: boolean, what: string): void => {
  if (!value) throw new AssertionFailed(what);
};

/** Fails when `fn` resolves, or when it throws something not matching `pattern`. */
export const assertRejects = async (
  fn: () => Promise<unknown>,
  pattern: RegExp,
  what: string,
): Promise<void> => {
  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!pattern.test(message)) {
      throw new AssertionFailed(
        `${what}: threw "${message}", which does not match ${String(pattern)}`,
      );
    }
    return;
  }
  throw new AssertionFailed(`${what}: expected a rejection, but it resolved`);
};
