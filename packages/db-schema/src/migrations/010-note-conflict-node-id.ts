import type { Migration } from './types';

/**
 * The conflict's author is a clock's node id, not a `deviceId`. The
 * table has held no rows before this version, so a rename carries nothing over.
 */
export const migration010: Migration = {
  number: 10,
  name: 'note-conflict-node-id',
  statements: [`ALTER TABLE note_conflicts RENAME COLUMN from_device_id TO from_node_id`],
};
