# Storage performance

This module's slice of the budget in plan §12, measured against a seeded library of 5,000 entries.

## Snapshot (2026-09-23, grid query)

The library is now read through `listLibraryGrid`, which selects only what a grid cell shows plus the open-note count (plan §12.2). It replaced `listLibraryEntries`, which returned full entries with their genres and platforms and had no caller outside tests.

| Measurement                         | Budget     | Measured                     | Notes                                                    |
| ----------------------------------- | ---------- | ---------------------------- | -------------------------------------------------------- |
| Catalog search, two words           | < 50 ms    | **0.4 ms**                   | `searchGames('dark souls')`                              |
| Catalog search, prefix              | < 50 ms    | **0.3 ms**                   | `searchGames('zel')`: what typing does                   |
| Filter by status                    | < 100 ms   | **0.3 ms**                   | 50-row page                                              |
| Filter by tag                       | < 100 ms   | **0.5 ms**                   | joins `entry_tags`                                       |
| Sort by recent                      | < 100 ms   | **0.7 ms**                   |                                                          |
| Sort by name                        | < 100 ms   | **1.6 ms**                   | joins `games`; sorts the live rows in a temporary B-tree |
| Sort by rating                      | < 100 ms   | **1.5 ms**                   | nullable column; temporary B-tree                        |
| Sort by playtime                    | < 100 ms   | **1.5 ms**                   |                                                          |
| Page 21 (1,000 rows deep)           | < 100 ms   | **1.7 ms**                   | keyset paging does not degrade                           |
| Apply 1,000 rows in one transaction | responsive | **4.8 ms**, one notification | a sync pull's batch                                      |
| Seed 5,000 entries + tags + notes   | —          | **662 ms**                   | now a few batched transactions instead of one per row    |

Against the previous snapshot, list queries are 40–75 % faster: they no longer build genre and platform lists for every row, and the open-note count costs one index lookup per row (`idx_note_items_entry`). `EXPLAIN QUERY PLAN` shows an index search for every filter and sort; name and rating sorts use a temporary B-tree over the live rows, as before.

### Previous snapshot (2026-09-23, real titles, full-row query)

Filter by status 0.7 ms, by tag 0.9 ms; sort by recent 1.4 ms, name 2.7 ms, rating 2.4 ms, playtime 2.6 ms; page 21 2.9 ms; seed 756 ms.

## How to reproduce

```sh
pnpm --filter @gameplan/storage exec vitest run src/performance --reporter=verbose
```

Each figure is the best of five runs. The best run is the one least disturbed by other work on the machine, which keeps CI from failing on noise while still catching a real slowdown. The seed is deterministic, so the same library is measured every time and a difference means a real change.

## What these numbers are not

**They are not a promise about the phone.** They were taken in Node against an in-memory `node:sqlite` on an Apple-silicon laptop. A phone has slower storage, a file-backed database, and a UI thread competing for time. Expect device figures to be considerably slower — still far inside budget, but not comparable.

The device measurements come with T11 (op-sqlite on a simulator) and T12 (Maestro on real hardware). Those, plus the rendering budgets in plan §12, belong to `mobile-library`.

**The titles are real, but repeated.** The seed cycles 1,000 of IGDB's most-rated games (`src/testing/fixtures/catalog.json`, captured with `pnpm --filter api capture:games`) five times under new ids. Search meets real punctuation and subtitles, but each title appears five times.

## Measured on

- Apple silicon laptop, Node 24, `node:sqlite` in memory
- 5,000 games (1,000 real titles cycled), one library entry each, tags on ~15% of entries, notes on ~30%
