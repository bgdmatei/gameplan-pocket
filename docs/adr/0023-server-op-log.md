# ADR-023: A per-user op log, materialised rows and a snapshot on the server

Status: Accepted (2026-11-10, module `sync-transport`).

## Context

Every device already records each change as an op with a hybrid logical clock per field (ADR-007, 008) and keeps it in an outbox until something acknowledges it (`sync-core`). Module 8 adds the server those ops travel through. It has to:

- let a device ask "what changed since I last looked", cheaply and without missing anything;
- bring a freshly signed-in device up to date with a library of thousands of games;
- refuse ops it must not accept (the field allowlist, clocks too far ahead), before they reach anyone else;
- serve future readers that want current state rather than history: the web app (module 14), stats (13) and export.

Ops merge per field with last-writer-wins, so applying them is idempotent and order-independent (`mergeOp` is commutative). Correctness does not depend on the order the server delivers them in, only on every device eventually receiving all of them.

## Options considered

1. **Op log only.** Store every accepted op and let devices pull the log. Simple, and it is the source of truth for "what changed since". But a new device has to replay the whole history, and every reader of current state has to fold the log itself.
2. **Current state only.** Merge each op into per-user rows and have devices pull rows changed since a timestamp. One table per entity, no history. But "changed since" by timestamp is unreliable: concurrent transactions commit out of timestamp order, so a reader can skip a row committed late with an earlier stamp. A device then misses an edit for good.
3. **Both: an op log numbered per user, plus materialised rows, plus a snapshot.** The log answers "since when", the rows answer "what is it now".

## Decision

Option 3.

- **`ops`** holds every accepted op, numbered by **`user_seq`**, a gap-free sequence per user. A push takes a row lock on that user's `user_sync` row, so concurrent pushes for one user are numbered one after the other. Numbers then match commit order, and a device that has seen up to `n` has seen everything up to `n`. Per user, not global: one account's traffic never contends with another's, and a sequence number reveals nothing about other users.
- **Materialised tables** (`library_entries`, `entry_tags`, `note_items`, `lists`, `list_items`), keyed on `(user_id, id)` with `field_hlc` and `deleted`, are updated in the same transaction by `mergeOp`, the same function the phone runs. The server can't hold a state a device wouldn't reach.
- **`/sync/snapshot`** pages over those rows with their clocks, and gives a new device the log position they were read at. The device merges the rows field by field, then pulls from that position.
- **`user_id` comes from the access token**, never from an op. Entry ids are derived from the game alone (ADR-006), so they are unique only within a user. Keying on `(user_id, id)` makes another user's row unreachable by construction, not by a check.

## Consequences

- Every op is stored twice in effect, once in the log and once folded into a row. The log grows without bound until compaction (module 13), which can fold old ops away because the rows and the snapshot already carry their effect.
- A push is serialised per user. That is the price of gap-free numbering. One person's devices rarely push at the same moment, and a push is a few hundred inserts, so the wait is short. Different users never wait on each other.
- Snapshot pages are separate requests, so later pages can hold rows newer than the snapshot's position. That is safe: the pull that follows replays those ops, and merging them again changes nothing. Consistency comes from idempotence, not from a long-lived transaction.
- The server merges but never validates domain rules (status transitions and so on). As on the device, a merge must accept any state, or devices stop converging (`SPEC-domain-model.md`, merge safety). The server's only refusals happen at the door, before an op enters the log, where refusing is still safe.
- The door checks and the merge live in `@gameplan/sync-server`, a pure package. The API runs them inside its transaction, and an in-memory server built from the same functions lets the convergence property test the real server logic without a database.
