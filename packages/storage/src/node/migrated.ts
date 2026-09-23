import { migrate } from '@gameplan/db-schema';
import type { NodeAdapterOptions, StorageAdapter } from '../adapter';
import { createNodeAdapter } from './adapter';

/**
 * A Node test database with every migration applied, for packages built on
 * storage (`sync`) that may not import the schema package themselves.
 */
export const createMigratedNodeAdapter = async (
  options: NodeAdapterOptions = {},
): Promise<StorageAdapter> => {
  const adapter = createNodeAdapter(options);
  await migrate(adapter);
  return adapter;
};
