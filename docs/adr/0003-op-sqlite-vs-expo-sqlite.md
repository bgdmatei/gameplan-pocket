# ADR-003: op-sqlite on the phone, not expo-sqlite

Status: Accepted (2026-09-22, module `storage-adapter`). Written up 2026-10-06, at the close of Phase 1, with what the phone has since measured.

## Context

The phone keeps the whole library in SQLite and works offline. Its database must search game names on every keystroke (FTS5, plan §8.2), stay fast with 5,000 entries, apply a sync batch in one transaction, and keep heavy queries off the JS thread so scrolling doesn't stutter. Screens never talk to the driver: they go through the `StorageAdapter` interface in `packages/storage`, which a Node implementation also satisfies for tests.

## Options considered

1. **op-sqlite.** A JSI binding that runs queries off the JS thread, with SQLite build options (FTS5 among them) chosen at compile time. Needs a dev build, not Expo Go; the app already runs as a dev build.
2. **expo-sqlite.** Part of the Expo SDK, simpler to set up, with web support that was less mature (plan §6.2). Fewer knobs for the build and for threading.

## Decision

Option 1, op-sqlite, behind `StorageAdapter`, in WAL mode. `expo-sqlite` stays the named fallback (`SPEC-map.md`, load-bearing spikes) if op-sqlite stopped working in the monorepo; the adapter interface means only one file would change.

## Consequences

- **FTS5 is a compile-time option that op-sqlite leaves out by default, while Node's SQLite includes it.** Local search passed in CI and failed on the simulator with `no such module: fts5`. The flag now lives in the root `package.json` (ADR-001), and anything resting on a SQLite compile option is only proven by running the storage contract on a device (Debug → Run the storage contract), never by CI alone.
- op-sqlite doesn't queue overlapping transactions, so the adapter serialises them itself (`serial-queue.ts`, mobile-library T1), with a contract case run on the device.
- On an iPhone 15 Pro against the 5,000-entry seed (Release build, `apps/mobile/PERFORMANCE.md`): a keystroke reaches local FTS5 results in 16 ms (median), a status filter reaches the grid in 44 ms, and grid scrolling holds ~60 fps on the JS thread.
- Every native rebuild (a new op-sqlite version, a changed build flag) means rebuilding and reinstalling the dev client and the Release build.
