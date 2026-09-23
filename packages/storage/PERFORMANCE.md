# Storage performance

This module's slice of the budget in plan §12, measured against a seeded library of 5,000 entries.

## Snapshot (2026-09-23, real titles)

| Measurement                         | Budget     | Measured                     | Notes                                                     |
| ----------------------------------- | ---------- | ---------------------------- | --------------------------------------------------------- |
| Catalog search, two words           | < 50 ms    | **0.3 ms**                   | `searchGames('dark souls')`                               |
| Catalog search, prefix              | < 50 ms    | **0.3 ms**                   | `searchGames('zel')` — what typing does                   |
| Filter by status                    | < 100 ms   | **0.7 ms**                   | 50-row page                                               |
| Filter by tag                       | < 100 ms   | **0.9 ms**                   | joins `entry_tags`                                        |
| Sort by recent                      | < 100 ms   | **1.4 ms**                   |                                                           |
| Sort by name                        | < 100 ms   | **2.7 ms**                   | joins `games`                                             |
| Sort by rating                      | < 100 ms   | **2.4 ms**                   | nullable column                                           |
| Sort by playtime                    | < 100 ms   | **2.6 ms**                   |                                                           |
| Page 21 (1,000 rows deep)           | < 100 ms   | **2.9 ms**                   | keyset paging does not degrade                            |
| Apply 1,000 rows in one transaction | responsive | **5.2 ms**, one notification | a sync pull's batch                                       |
| Seed 5,000 entries + tags + notes   | —          | **756 ms**                   | 1,000 real games cycled to 5,000, 22 genres, 80 platforms |

Still two orders of magnitude inside budget, which says the queries use their indexes rather than scanning. That is what these numbers are for: a query that starts scanning shows up here immediately, wherever it runs.

Against the first snapshot (2026-09-20, generated titles), sorts and deep paging are 0.4–0.7 ms slower and search is unchanged. Real titles are longer and less uniform, and every game now carries genres and platforms.

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
