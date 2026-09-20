/**
 * Framework-free test helpers: safe for the app to import, so a debug screen
 * can run the adapter contract against op-sqlite on a real device.
 *
 * The Vitest wrapper lives in `./vitest-suite` and is imported directly by
 * test files, never from here, so Vitest cannot reach the phone's bundle.
 */
export { AssertionFailed, assertEqual, assertRejects, assertTrue } from './assert';
export { adapterCases } from './cases';
export type { AdapterCase } from './cases';
export { runAdapterCases } from './run-cases';
export { seed } from './seed';
export type { SeedOptions, SeedResult } from './seed';
