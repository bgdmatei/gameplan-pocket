# Storage performance

This module's slice of the budget in plan §12, measured against a seeded library of 5,000 entries.

## Snapshot (2026-09-20)

| Measurement                         | Budget     | Measured                     | Notes                                                  |
| ----------------------------------- | ---------- | ---------------------------- | ------------------------------------------------------ |
| Catalog search, two words           | < 50 ms    | **0.4 ms**                   | `searchGames('shadow real')`                           |
| Catalog search, prefix              | < 50 ms    | **0.5 ms**                   | `searchGames('sha')` — what typing does                |
| Filter by status                    | < 100 ms   | **0.5 ms**                   | 50-row page                                            |
| Filter by tag                       | < 100 ms   | **0.7 ms**                   | joins `entry_tags`                                     |
| Sort by recent                      | < 100 ms   | **0.7 ms**                   |                                                        |
| Sort by name                        | < 100 ms   | **2.1 ms**                   | joins `games`                                          |
| Sort by rating                      | < 100 ms   | **2.1 ms**                   | nullable column                                        |
| Sort by playtime                    | < 100 ms   | **2.0 ms**                   |                                                        |
| Page 21 (1,000 rows deep)           | < 100 ms   | **2.3 ms**                   | keyset paging does not degrade                         |
| Apply 1,000 rows in one transaction | responsive | **5.2 ms**, one notification | a sync pull's batch                                    |
| Seed 5,000 entries + tags + notes   | —          | **617 ms**                   | 5,000 games, ~5,000 entries, ~5,200 tags, ~2,300 notes |

Two orders of magnitude inside budget, which says the queries use their indexes rather than scanning. That is what these numbers are for: a query that starts scanning shows up here immediately, wherever it runs.

## How to reproduce

```sh
pnpm --filter @gameplan/storage exec vitest run src/performance --reporter=verbose
```

Each figure is the best of five runs. The best run is the one least disturbed by other work on the machine, which keeps CI from failing on noise while still catching a real slowdown. The seed is deterministic, so the same library is measured every time and a difference means a real change.

## What these numbers are not

**They are not a promise about the phone.** They were taken in Node against an in-memory `node:sqlite` on an Apple-silicon laptop. A phone has slower storage, a file-backed database, and a UI thread competing for time. Expect device figures to be considerably slower — still far inside budget, but not comparable.

The device measurements come with T11 (op-sqlite on a simulator) and T12 (Maestro on real hardware). Those, plus the rendering budgets in plan §12, belong to `mobile-library`.

**The seed flatters search.** Generated titles are more uniform than real ones, so full-text search has an easier job than it will with real IGDB data. `catalog-service` (module 5) replaces the generator with a captured fixture; these numbers should be taken again then.

## Measured on

- Apple silicon laptop, Node 24, `node:sqlite` in memory
- 5,000 games, one library entry each, tags on ~15% of entries, notes on ~30%
