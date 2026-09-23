# ADR-010: Build the sync engine rather than buy one

Status: Accepted (2026-09-23, module `sync-core`)

## Context

The app needs offline-first sync across a phone and (later) a browser: local SQLite as the source of truth, edits queued while offline, and convergence when devices reconnect. Several products solve this. This project exists partly to practise architecture and system design, so learning is an explicit goal alongside shipping.

## Options considered

- **PowerSync.** Syncs Postgres to client SQLite with a managed or self-hosted service. Handles partial replication (sync rules), auth-scoped data and upload queues; clients write through an upload handler the app implements.
- **ElectricSQL.** Streams Postgres "shapes" to clients; writes go through the app's own API. Strong on read-path partial replication.
- **Zero (Rocicorp).** Query-driven sync with a server-side cache and optimistic mutators; relatively new.
- **Replicache.** Client-side key-value store with push/pull and server-authoritative mutators; now in maintenance mode, with Zero as its successor.
- **Triplit.** Full-stack syncing database with its own query language and storage.
- **Build our own.** HLC, op log, per-field LWW, push/pull over the existing Hono API.

What the products solve that ours does not (yet): partial replication by query or shape, battle-tested edge cases across many apps, managed infrastructure, multi-tab coordination on the web, and schema migration of synced data.

## Decision

Build our own, deliberately small: one user's data, a handful of entities, per-field LWW (ADR-008). The whole library of one user fits on a device, so partial replication, the main reason to buy, is not needed.

## Consequences

- Correctness is on us. The property test, deterministic fake time and seeded replays are the mitigation, and "cut features, never sync correctness tests" is the standing rule.
- No vendor service to run or pay for, and no lock-in of the storage layer.
- The honest production answer is "buy": for a team shipping to many users, PowerSync or Electric would save months. This is recorded so the choice reads as informed, not as not-invented-here.

## Revisit if

Data stops fitting on a device (shared or public libraries at scale), multi-user collaboration is needed, or maintaining sync starts crowding out product work.
