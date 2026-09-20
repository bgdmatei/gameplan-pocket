import type { SqlParams, StorageAdapter } from '../adapter';
import { assertEqual, assertRejects, assertTrue } from './assert';

/**
 * The contract every database implementation must satisfy, written without a
 * test framework so it can run in three places: Vitest on CI (against
 * node:sqlite), inside the app on a device (against op-sqlite), and later in a
 * browser (against SQLite compiled to WebAssembly).
 *
 * This list *is* the definition of `StorageAdapter`. An implementation is not
 * finished until every case passes unchanged.
 */
export type AdapterCase = {
  name: string;
  run: (adapter: StorageAdapter) => Promise<void>;
};

const CREATE_THINGS =
  'CREATE TABLE things (id TEXT PRIMARY KEY, name TEXT, flag INTEGER, note TEXT)';

const setup = async (adapter: StorageAdapter): Promise<void> => {
  await adapter.execute(CREATE_THINGS);
};

/** Counts calls without pulling in a mocking library. */
const counter = (): { calls: number; listener: () => void } => {
  const state = { calls: 0, listener: (): void => {} };
  state.listener = (): void => {
    state.calls += 1;
  };
  return state;
};

export const adapterCases: readonly AdapterCase[] = [
  {
    name: 'returns rows as plain objects',
    run: async (adapter) => {
      await setup(adapter);
      await adapter.execute('INSERT INTO things (id, name) VALUES (?, ?)', ['a', 'Witcher']);

      const rows = await adapter.execute('SELECT * FROM things');

      assertEqual(rows, [{ id: 'a', name: 'Witcher', flag: null, note: null }], 'row contents');
      assertTrue(
        Object.getPrototypeOf(rows[0]) === Object.prototype,
        'rows must be plain objects, not null-prototype records',
      );
    },
  },
  {
    name: 'returns an empty list for a write',
    run: async (adapter) => {
      await setup(adapter);
      assertEqual(
        await adapter.execute('INSERT INTO things (id) VALUES (?)', ['a']),
        [],
        'write result',
      );
    },
  },
  {
    name: 'binds strings, numbers and null',
    run: async (adapter) => {
      await setup(adapter);
      await adapter.execute('INSERT INTO things (id, name, flag, note) VALUES (?, ?, ?, ?)', [
        'a',
        'Witcher',
        3,
        null,
      ]);

      assertEqual(
        await adapter.execute('SELECT * FROM things'),
        [{ id: 'a', name: 'Witcher', flag: 3, note: null }],
        'bound values',
      );
    },
  },
  {
    name: 'keeps value types: integers come back as numbers, text as strings',
    run: async (adapter) => {
      await setup(adapter);
      await adapter.execute('INSERT INTO things (id, flag) VALUES (?, ?)', ['a', 7]);

      const rows = await adapter.execute<{ id: unknown; flag: unknown }>(
        'SELECT id, flag FROM things',
      );
      const row = rows[0];

      assertTrue(typeof row?.flag === 'number', 'an integer column must return a number');
      assertTrue(typeof row?.id === 'string', 'a text column must return a string');
    },
  },
  {
    name: 'binds booleans as 0 and 1',
    run: async (adapter) => {
      await setup(adapter);
      await adapter.execute('INSERT INTO things (id, flag) VALUES (?, ?)', ['yes', true]);
      await adapter.execute('INSERT INTO things (id, flag) VALUES (?, ?)', ['no', false]);

      assertEqual(
        await adapter.execute('SELECT id, flag FROM things ORDER BY id'),
        [
          { id: 'no', flag: 0 },
          { id: 'yes', flag: 1 },
        ],
        'boolean binding',
      );
    },
  },
  {
    name: 'rejects undefined instead of storing null',
    run: async (adapter) => {
      await setup(adapter);
      const params = ['a', undefined] as unknown as SqlParams;

      await assertRejects(
        () => adapter.execute('INSERT INTO things (id, name) VALUES (?, ?)', params),
        /undefined/i,
        'undefined parameter',
      );
    },
  },
  {
    name: 'refuses a string containing NUL, which SQLite would truncate at',
    run: async (adapter) => {
      await setup(adapter);

      await assertRejects(
        () =>
          adapter.execute('INSERT INTO things (id, name) VALUES (?, ?)', [
            'a',
            'before\u0000after',
          ]),
        /NUL/i,
        'NUL in a string parameter',
      );
    },
  },
  {
    name: 'names the failing statement when SQL is invalid',
    run: async (adapter) => {
      await assertRejects(
        () => adapter.execute('SELECT * FROM missing_table'),
        /missing_table/,
        'invalid SQL',
      );
    },
  },
  {
    name: 'commits a transaction when the callback returns',
    run: async (adapter) => {
      await setup(adapter);

      const result = await adapter.transaction(async (tx) => {
        await tx.execute('INSERT INTO things (id) VALUES (?)', ['a']);
        await tx.execute('INSERT INTO things (id) VALUES (?)', ['b']);
        return 'done';
      });

      assertEqual(result, 'done', 'transaction result');
      assertEqual(
        await adapter.execute('SELECT id FROM things ORDER BY id'),
        [{ id: 'a' }, { id: 'b' }],
        'committed rows',
      );
    },
  },
  {
    name: 'rolls a transaction back when the callback throws',
    run: async (adapter) => {
      await setup(adapter);

      await assertRejects(
        () =>
          adapter.transaction(async (tx) => {
            await tx.execute('INSERT INTO things (id) VALUES (?)', ['a']);
            throw new Error('changed my mind');
          }),
        /changed my mind/,
        'failing transaction',
      );

      assertEqual(await adapter.execute('SELECT id FROM things'), [], 'rows after rollback');
    },
  },
  {
    name: 'rolls back when a statement inside the transaction fails',
    run: async (adapter) => {
      await setup(adapter);

      await assertRejects(
        () =>
          adapter.transaction(async (tx) => {
            await tx.execute('INSERT INTO things (id) VALUES (?)', ['a']);
            await tx.execute('INSERT INTO things (id) VALUES (?)', ['a']);
          }),
        /.*/,
        'duplicate insert',
      );

      assertEqual(await adapter.execute('SELECT id FROM things'), [], 'rows after rollback');
    },
  },
  {
    name: 'refuses a nested transaction',
    run: async (adapter) => {
      await setup(adapter);

      await assertRejects(
        () => adapter.transaction(async () => adapter.transaction(async () => undefined)),
        /nested/i,
        'nested transaction',
      );
    },
  },
  {
    name: 'accepts a new transaction after one failed',
    run: async (adapter) => {
      await setup(adapter);

      await assertRejects(
        () =>
          adapter.transaction(async () => {
            throw new Error('first');
          }),
        /first/,
        'first transaction',
      );

      await adapter.transaction(async (tx) => {
        await tx.execute('INSERT INTO things (id) VALUES (?)', ['a']);
      });

      assertEqual(
        await adapter.execute('SELECT id FROM things'),
        [{ id: 'a' }],
        'rows after retry',
      );
    },
  },
  {
    name: 'notifies subscribers after a write commits',
    run: async (adapter) => {
      await setup(adapter);
      const watcher = counter();
      adapter.subscribe(['things'], watcher.listener);

      await adapter.execute('INSERT INTO things (id) VALUES (?)', ['a']);

      assertEqual(watcher.calls, 1, 'notifications after a write');
    },
  },
  {
    name: 'notifies once per transaction, not once per row',
    run: async (adapter) => {
      await setup(adapter);
      const watcher = counter();
      adapter.subscribe(['things'], watcher.listener);

      await adapter.transaction(async (tx) => {
        for (const id of ['a', 'b', 'c']) {
          await tx.execute('INSERT INTO things (id) VALUES (?)', [id]);
        }
      });

      assertEqual(watcher.calls, 1, 'notifications for a three-row transaction');
    },
  },
  {
    name: 'stays quiet when a transaction rolls back',
    run: async (adapter) => {
      await setup(adapter);
      const watcher = counter();
      adapter.subscribe(['things'], watcher.listener);

      await assertRejects(
        () =>
          adapter.transaction(async (tx) => {
            await tx.execute('INSERT INTO things (id) VALUES (?)', ['a']);
            throw new Error('no');
          }),
        /no/,
        'failing transaction',
      );

      assertEqual(watcher.calls, 0, 'notifications after a rollback');
    },
  },
  {
    name: 'stays quiet for reads',
    run: async (adapter) => {
      await setup(adapter);
      const watcher = counter();
      adapter.subscribe(['things'], watcher.listener);

      await adapter.execute('SELECT * FROM things');
      await adapter.transaction(async (tx) => {
        await tx.execute('SELECT * FROM things');
      });

      assertEqual(watcher.calls, 0, 'notifications for reads');
    },
  },
  {
    name: 'notifies only the subscribers watching the changed table',
    run: async (adapter) => {
      await setup(adapter);
      await adapter.execute('CREATE TABLE others (id TEXT)');
      const onThings = counter();
      const onOthers = counter();
      adapter.subscribe(['things'], onThings.listener);
      adapter.subscribe(['others'], onOthers.listener);

      await adapter.execute('INSERT INTO things (id) VALUES (?)', ['a']);

      assertEqual(onThings.calls, 1, 'notifications for the written table');
      assertEqual(onOthers.calls, 0, 'notifications for an untouched table');
    },
  },
  {
    name: 'stops notifying once unsubscribed',
    run: async (adapter) => {
      await setup(adapter);
      const watcher = counter();
      const unsubscribe = adapter.subscribe(['things'], watcher.listener);

      unsubscribe();
      await adapter.execute('INSERT INTO things (id) VALUES (?)', ['a']);

      assertEqual(watcher.calls, 0, 'notifications after unsubscribing');
    },
  },
  {
    name: 'keeps notifying others when one listener throws',
    run: async (adapter) => {
      await setup(adapter);
      const healthy = counter();
      adapter.subscribe(['things'], () => {
        throw new Error('listener blew up');
      });
      adapter.subscribe(['things'], healthy.listener);

      await adapter.execute('INSERT INTO things (id) VALUES (?)', ['a']);

      assertEqual(healthy.calls, 1, 'notifications to a healthy listener');
    },
  },
  {
    name: 'can be closed twice and refuses queries afterwards',
    run: async (adapter) => {
      await setup(adapter);
      await adapter.close();
      await adapter.close();

      await assertRejects(() => adapter.execute('SELECT 1'), /closed/i, 'query after close');
    },
  },
];
