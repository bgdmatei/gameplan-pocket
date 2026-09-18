import { afterEach, describe, it } from 'vitest';
import type { StorageAdapter } from '../adapter';
import { adapterCases } from './cases';

/**
 * Runs the adapter contract under Vitest. The cases themselves are
 * framework-free (`./cases`), so the same list also runs inside the app
 * against op-sqlite, where no test runner exists.
 */
export const runAdapterSuite = (
  name: string,
  createAdapter: () => StorageAdapter | Promise<StorageAdapter>,
): void => {
  describe(`${name} adapter contract`, () => {
    let adapter: StorageAdapter | undefined;

    afterEach(async () => {
      await adapter?.close();
      adapter = undefined;
    });

    for (const testCase of adapterCases) {
      it(testCase.name, async () => {
        adapter = await createAdapter();
        await testCase.run(adapter);
      });
    }
  });
};
