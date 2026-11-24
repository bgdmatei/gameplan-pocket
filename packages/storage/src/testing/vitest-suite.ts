import { afterEach, describe, it } from 'vitest';
import type { StorageAdapter } from '../adapter';
import { adapterCases } from './cases';
import { schemaCases } from './schema-cases';

/**
 * Runs the adapter contract under Vitest. The cases themselves are
 * framework-free (`./cases`), so the same list also runs inside the app
 * against op-sqlite, where no test runner exists.
 */
export const runAdapterSuite = (
  name: string,
  createAdapter: () => StorageAdapter | Promise<StorageAdapter>,
): void => {
  const suites = [
    [`${name} adapter contract`, adapterCases],
    [`${name} on the shipped schema`, schemaCases],
  ] as const;
  for (const [title, cases] of suites)
    describe(title, () => {
      let adapter: StorageAdapter | undefined;

      afterEach(async () => {
        await adapter?.close();
        adapter = undefined;
      });

      for (const testCase of cases) {
        it(testCase.name, async () => {
          adapter = await createAdapter();
          await testCase.run(adapter);
        });
      }
    });
};
