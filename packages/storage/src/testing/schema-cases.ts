import { migrate } from '@gameplan/db-schema';
import { createEntry } from '@gameplan/domain';
import { listOpenConflicts } from '../repositories/note-conflicts';
import { SYNCED_ROWS } from '../repositories/synced-rows';
import { writeRows } from '../repositories/write';
import { assertEqual } from './assert';
import type { AdapterCase } from './cases';

/**
 * Cases on the app's own schema, not the adapter contract: what a migration
 * or a query does only counts once it runs on op-sqlite, so the device check
 * runs these after the contract.
 */
export const schemaCases: readonly AdapterCase[] = [
  {
    name: 'stores a note conflict and reads it back through its note',
    run: async (adapter) => {
      await migrate(adapter);
      const createdAt = '2026-11-24T10:00:00.000Z';
      const conflict = {
        id: 'conflict-1',
        noteItemId: 'note-1',
        text: 'Lever behind the waterfall, «left» one',
        fromNodeId: '00000000000000aa',
        hlc: '000000000000001:00000:00000000000000aa',
        createdAt,
        resolved: false,
      };
      await adapter.transaction((tx) =>
        writeRows(tx, {
          rows: [
            {
              table: SYNCED_ROWS.library_entries.table,
              row: SYNCED_ROWS.library_entries.toRow(
                createEntry(
                  { id: 'entry-1', gameId: 1942, status: 'playing', createdAt },
                  { today: '2026-11-24' },
                ),
                { fieldHlc: '{}', deleted: false, now: createdAt },
              ),
            },
            {
              table: 'note_items',
              row: {
                id: 'note-1',
                entry_id: 'entry-1',
                type: 'puzzle',
                text: 'Lever',
                location: null,
                resolved: false,
                created_at: createdAt,
                updated_at: createdAt,
              },
            },
            {
              table: SYNCED_ROWS.note_conflicts.table,
              row: SYNCED_ROWS.note_conflicts.toRow(conflict, {
                fieldHlc: '{}',
                deleted: false,
                now: createdAt,
              }),
            },
          ],
        }),
      );

      assertEqual(await listOpenConflicts(adapter, 'note-1'), [conflict], 'open conflicts');
    },
  },
];
