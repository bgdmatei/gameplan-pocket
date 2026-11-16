import { pullResponseSchema, snapshotResponseSchema } from '@gameplan/contracts';
import type { PullResponse, SnapshotResponse, SnapshotRow } from '@gameplan/contracts';
import { EMPTY_ROW, mergeOp, mergeRow, opSchema } from '@gameplan/sync';
import type { RowState } from '@gameplan/sync';
import type { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../testing/auth';
import type { TestAuth } from '../testing/auth';
import { createSyncTestKit } from '../testing/sync';
import type { SyncTestKit } from '../testing/sync';

describe('GET /sync/pull and /sync/snapshot', () => {
  let t: TestAuth & { app: Hono };
  let kit: SyncTestKit;

  beforeAll(async () => {
    t = await createTestApp();
    kit = createSyncTestKit(t);
  });

  const pull = async (token: string, after: number, limit: number): Promise<PullResponse> => {
    const { status, body } = await kit.get(token, `/sync/pull?after=${after}&limit=${limit}`);
    expect(status).toBe(200);
    return pullResponseSchema.parse(body);
  };

  const snapshot = async (token: string, limit: number, cursor?: string) => {
    const query = cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`;
    const { status, body } = await kit.get(token, `/sync/snapshot?limit=${limit}${query}`);
    expect(status).toBe(200);
    return snapshotResponseSchema.parse(body);
  };

  /** Every page from `after`, as the device pulls them. */
  const pullAll = async (token: string, after: number, limit = 500) => {
    const pages: PullResponse[] = [];
    let page = await pull(token, after, limit);
    pages.push(page);
    while (page.hasMore) {
      page = await pull(token, page.lastSeq, limit);
      pages.push(page);
    }
    return pages;
  };

  /** Rows, keyed `entity:id`, folded from ops with the merge the phone runs. */
  const replay = (ops: readonly unknown[], start = new Map<string, RowState>()) => {
    const rows = new Map(start);
    for (const raw of ops) {
      const op = opSchema.parse(raw);
      const key = `${op.entity}:${op.entityId}`;
      rows.set(key, mergeOp(rows.get(key) ?? EMPTY_ROW, op));
    }
    return rows;
  };

  // Five lists, four tags and a delete: rows across two tables, so a page
  // boundary falls both inside a table and between tables.
  const seed = async (token: string) => {
    await kit.push(token, [
      ...['l-0', 'l-1', 'l-2', 'l-3', 'l-4'].map((id) => kit.setOp('list', id, { name: id })),
      ...['t-0', 't-1', 't-2', 't-3'].map((id) =>
        kit.setOp('entry_tag', id, { entryId: 'e-1', tag: id }),
      ),
      kit.deleteOp('list', 'l-2'),
    ]);
  };

  it('pages through every op and every row once, in order', async () => {
    const { token } = await kit.account();
    await seed(token);

    const pulled = await pullAll(token, 0, 3);
    expect(pulled.map((page) => page.ops.map(({ seq }) => seq))).toEqual([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
      [10],
    ]);

    const rows: SnapshotRow[] = [];
    let page: SnapshotResponse = await snapshot(token, 2);
    rows.push(...page.rows);
    while (page.nextCursor !== null) {
      page = await snapshot(token, 2, page.nextCursor);
      rows.push(...page.rows);
    }
    expect(
      rows.map(({ entity, id, deleted }) => `${entity}:${id}${deleted ? ' (deleted)' : ''}`),
    ).toEqual([
      'entry_tag:t-0',
      'entry_tag:t-1',
      'entry_tag:t-2',
      'entry_tag:t-3',
      'list:l-0',
      'list:l-1',
      'list:l-2 (deleted)',
      'list:l-3',
      'list:l-4',
    ]);
  });

  // ADR-023: pages are separate requests, so later pages may hold rows newer
  // than the snapshot's position. Pulling from that position must still end
  // exactly where a device that replayed the whole log would.
  it('snapshot then pull from its position equals replaying the whole log', async () => {
    const { token } = await kit.account();
    await seed(token);

    const first = await snapshot(token, 3);
    // Edits land while the device is still paging.
    await kit.push(token, [
      kit.setOp('list', 'l-0', { name: 'renamed' }),
      kit.setOp('list', 'l-9', { name: 'new' }),
      kit.setOp('list', 'l-2', { name: 'back' }),
      kit.deleteOp('entry_tag', 't-0'),
    ]);
    const rows = [...first.rows];
    let cursor = first.nextCursor;
    while (cursor !== null) {
      const page = await snapshot(token, 3, cursor);
      expect(page.seq).toBe(first.seq);
      rows.push(...page.rows);
      cursor = page.nextCursor;
    }

    const bootstrapped = new Map(
      rows.map((row) => [
        `${row.entity}:${row.id}`,
        mergeRow(EMPTY_ROW, { fields: row.fields, clocks: row.fieldHlc }),
      ]),
    );
    const after = (await pullAll(token, first.seq)).flatMap((page) => page.ops.map((o) => o.op));
    const everything = (await pullAll(token, 0)).flatMap((page) => page.ops.map((o) => o.op));

    expect(first.seq).toBe(10);
    expect(replay(after, bootstrapped)).toEqual(replay(everything));
  });

  // SPEC-sync-transport.md: another account's token reads none of these
  // rows, through either route, even holding the owner's own cursor.
  it("shows another account none of a user's ops or rows", async () => {
    const owner = await kit.account();
    const other = await kit.account();
    await seed(owner.token);
    const ownersPage = await snapshot(owner.token, 2);

    expect((await pull(other.token, 0, 500)).ops).toEqual([]);
    expect((await snapshot(other.token, 500)).rows).toEqual([]);
    expect(ownersPage.nextCursor).not.toBeNull();
    expect((await snapshot(other.token, 500, ownersPage.nextCursor ?? '')).rows).toEqual([]);
  });

  // Review of #16: a cursor carries the page's last row id, and an id the
  // door accepts could encode past the cursor's old 256-character limit.
  it('pages past the most awkward row id the door accepts', async () => {
    const { token } = await kit.account();
    const awkward = '\u0001'.repeat(64);
    await kit.push(token, [
      kit.setOp('list', awkward, { name: 'a' }),
      kit.setOp('list', 'z', { name: 'z' }),
    ]);

    const first = await snapshot(token, 1);
    const second = await snapshot(token, 1, first.nextCursor ?? '');

    expect([...first.rows, ...second.rows].map((row) => row.id)).toEqual([awkward, 'z']);
  });

  it('refuses a cursor it never handed out', async () => {
    const { token } = await kit.account();
    const forged = Buffer.from(JSON.stringify({ seq: 1, entity: 'users', id: 'x' })).toString(
      'base64url',
    );

    for (const cursor of ['not-a-cursor', forged]) {
      const { status, body } = await kit.get(token, `/sync/snapshot?cursor=${cursor}`);
      expect({ status, body }).toEqual({
        status: 400,
        body: { error: 'invalid_request', fields: ['cursor'] },
      });
    }
  });
});
