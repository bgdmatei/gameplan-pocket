import type { SqlParams, StorageAdapter, Transaction } from '../adapter';
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

/**
 * Waits long enough for a scheduled notification to be delivered.
 *
 * Delivery is deliberately not immediate: writes landing close together wake a
 * screen once, about a frame later. A case that asserted straight after a
 * write would be asserting on timing rather than behaviour — and would pass or
 * fail depending on whether the driver's writes happen to be synchronous.
 */
const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 80));
};

/** Yields to the event loop, so another caller gets the chance to interleave. */
const pause = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 20));
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
    // A double tap, or a sync pull landing mid-edit: the second transaction
    // waits its turn instead of failing, and never sees the first half-done.
    name: 'runs overlapping transactions one at a time, in call order',
    run: async (adapter) => {
      await setup(adapter);
      const seen: string[][] = [];
      const ids = async (tx: Transaction): Promise<string[]> =>
        (await tx.execute<{ id: string }>('SELECT id FROM things ORDER BY id')).map((r) => r.id);

      await Promise.all([
        adapter.transaction(async (tx) => {
          await tx.execute('INSERT INTO things (id) VALUES (?)', ['a']);
          await pause();
          seen.push(await ids(tx));
        }),
        adapter
          .transaction(async (tx) => {
            await tx.execute('INSERT INTO things (id) VALUES (?)', ['b']);
            throw new Error('second rolls back');
          })
          .catch(() => undefined),
        adapter.transaction(async (tx) => {
          await tx.execute('INSERT INTO things (id) VALUES (?)', ['c']);
          seen.push(await ids(tx));
        }),
      ]);

      assertEqual(seen, [['a'], ['a', 'c']], 'what each transaction saw');
      assertEqual(
        await adapter.execute('SELECT id FROM things ORDER BY id'),
        [{ id: 'a' }, { id: 'c' }],
        'rows after all three',
      );
    },
  },
  {
    name: 'makes a query outside a transaction wait until it commits',
    run: async (adapter) => {
      await setup(adapter);

      const writing = adapter.transaction(async (tx) => {
        await tx.execute('INSERT INTO things (id) VALUES (?)', ['a']);
        await pause();
        await tx.execute('INSERT INTO things (id) VALUES (?)', ['b']);
      });
      // Issued while the transaction is open: it must see both rows or none,
      // never 'a' alone.
      const reading = adapter.execute('SELECT id FROM things ORDER BY id');

      await writing;
      assertEqual(await reading, [{ id: 'a' }, { id: 'b' }], 'rows seen by the waiting query');
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
      await settle();

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

      await settle();

      assertEqual(watcher.calls, 1, 'notifications for a three-row transaction');
    },
  },
  {
    name: 'batches commits made in the same frame into one notification',
    run: async (adapter) => {
      await setup(adapter);
      const watcher = counter();
      adapter.subscribe(['things'], watcher.listener);

      // Two commits close together: a sync pull applying a batch must wake a
      // screen once, not once per commit. Whether the driver's writes are
      // synchronous (node) or asynchronous (the phone) must not change this.
      await Promise.all([
        adapter.execute('INSERT INTO things (id) VALUES (?)', ['a']),
        adapter.execute('INSERT INTO things (id) VALUES (?)', ['b']),
      ]);

      await settle();

      assertEqual(watcher.calls, 1, 'notifications for two commits in one frame');
      assertEqual(
        (await adapter.execute('SELECT id FROM things ORDER BY id')).length,
        2,
        'rows written',
      );
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

      await settle();

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

      await settle();

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
      await settle();

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
      await settle();

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
      await settle();

      assertEqual(healthy.calls, 1, 'notifications to a healthy listener');
    },
  },
  {
    name: 'destroy leaves no user data behind, and closes the database',
    run: async (adapter) => {
      await setup(adapter);
      await adapter.execute('INSERT INTO things (id, name) VALUES (?, ?)', ['a', 'private note']);

      await adapter.destroy();
      // Calling it twice must not blow up: a sign-out can be retried.
      await adapter.destroy();

      // Signing out on a shared device must leave nothing readable.
      await assertRejects(
        () => adapter.execute('SELECT * FROM things'),
        /closed/i,
        'query after destroy',
      );
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
