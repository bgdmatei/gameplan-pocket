import type { StorageAdapter } from '../adapter';
import { adapterCases } from './cases';

/**
 * Runs the contract without a test framework and reports what happened, for a
 * debug screen on a device. Never throws: the caller displays the failures.
 */
export const runAdapterCases = async (
  createAdapter: () => StorageAdapter | Promise<StorageAdapter>,
): Promise<{ name: string; passed: boolean; error?: string }[]> => {
  const results: { name: string; passed: boolean; error?: string }[] = [];

  for (const testCase of adapterCases) {
    const adapter = await createAdapter();
    try {
      await testCase.run(adapter);
      results.push({ name: testCase.name, passed: true });
    } catch (error) {
      results.push({
        name: testCase.name,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await adapter.close();
    }
  }

  return results;
};
