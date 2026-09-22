import { runAdapterSuite } from '../testing/vitest-suite';
import { createNodeAdapter } from './adapter';

// The same contract the phone's op-sqlite implementation must pass (T11).
runAdapterSuite('node:sqlite', () => createNodeAdapter());
