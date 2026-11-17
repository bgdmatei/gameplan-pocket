# ADR-017: Protocol and schema versioning

Status: Accepted (2026-11-17, module `schema-evolution`).

## Context

Phones update when their owner gets round to it, so the server always has apps older than itself talking to it. Plan §1 requires old apps to keep working against a newer server for at least one schema version. Since module 7, every request has sent `X-Protocol-Version: 1` and every op has carried `schemaVersion: 1`, but nothing read either value.

Two kinds of change reach an old app:

- **Additive:** a new optional field. An old app should ignore it. Catalog responses already drop unknown keys. Pulled ops did not: the app parsed them with the strict op schema, so one unknown field failed the whole pull.
- **Breaking:** a field changes meaning or shape. Our first one is the rating moving from 0–10 to 0–100 (ADR-020 reserved it for this). An old app reading 70 on a 0–10 scale would show nonsense; an old app sending 7 would overwrite a 70.

## Options considered

1. **One version number.** It is simple, but a wire change and an entity change then can't be told apart, and every op in the log would need re-reading whenever the protocol moves.
2. **Two numbers, ops stored as they arrived.** The server keeps each op at its own schema version and converts it on every read. The log records exactly what was sent, but every reader (merge, pull, snapshot, stats, export) has to handle every version for good.
3. **Two numbers, with the log always current.** Ops are converted at the door, and the log and materialised rows only ever hold the current version. Old apps are served through a downcast.

## Decision

Option 3 (owner, 2026-11-17).

- **Protocol version** (`X-Protocol-Version`, on every request): what an app can read. The server serves its own protocol and the one before. Below that, sync and catalog requests get `426 { error: 'update_required' }`; auth stays open, so an app can always sign in or out. An app _newer_ than the server is not told to update, since no update exists: it gets `400 { error: 'unsupported_protocol' }` and treats it as a temporary failure. The server therefore deploys before any app that needs it, and the protocol moves in the same release as the client migration that needs it (plan §11).
- **Schema version** (`schemaVersion`, on every op): the shape of that op's fields. On push the server picks the schema by the op's own version. A v1 op is checked as v1 first, so an out-of-range v1 value is refused rather than converted, and is then **upcast** and checked again as current. On pull and snapshot the server **downcasts** to the version the app's protocol reads: values converted, fields that version doesn't know dropped, and the op's `schemaVersion` set to the target, since installed apps accept only their own.
- **Casts are pure functions in `sync-core`**, one pair per version step. They change field values only, never an op's id, entity id or HLC, so a cast op merges exactly where the original would have.
- **Apps ignore unknown fields in pulled ops and snapshot rows.** With per-field ops an old app only ever sends the fields it changed, so it can't erase a field it doesn't know. The push door stays strict.
- **An upgraded app re-syncs** (owner, 2026-11-17). A downcast can lose information (a dropped field, a rounded value), and a cast keeps the clock, so a phone that later updates would hold the reduced value at the same clock as the server's full one, and no op would ever correct it. So when the protocol moves, the app keeps its outbox, discards its synced rows and pull position, reads the snapshot again, and re-applies its own queued ops through the merge. The result is what the server will hold once those ops are pushed.
- **Proof is a pinned client.** The N-1 test runs the sync code installed phones run, bundled from the last commit before the change, against the current server. A hand-written copy of the old shapes would prove only that the copy matches itself.

## Consequences

- A breaking change costs four pieces: a cast pair, a server migration that rewrites stored rows and the log to the new version, a client migration that converts the outbox and marks the device for a re-sync, and a protocol bump in the same release as that client migration.
- The server migration and the downcast ship together. If the stored data moves first, old apps are served new values as if they were old ones.
- A deploy has a window: the migration runs before the new server takes over, and the old server keeps accepting pushes until then. An old app pushing a rating in that window stores it unconverted. On staging the owner keeps phones from syncing during the deploy; production needs a fix-up of the ops the old server logged in the window (they still carry `schemaVersion` 1, so they are findable) or a maintenance window.
- Migration 005 rewrites the whole log in one transaction. That is fine at staging's size; a large production log would need it batched.
- A downcast can lose precision. Ratings round to the nearest step, halves up: 73 becomes 7 and 75 becomes 8 on an old app; the upcast is exact (×10). The app itself only writes multiples of 10, so loss needs a value from another source.
- Serving N-2 means a second cast step and a wider range, not a new mechanism. Dropping a version means raising `MIN_PROTOCOL_VERSION`; apps below it stop syncing, keep working offline with their edits queued, and show "Update needed".
- The pinned bundle is a generated file in the repo. It is re-pinned only on purpose, from a named commit.

## Revisit if

- The app ships through an app store with forced updates, where N-1 support could narrow.
- A change can't be expressed as a pure per-op cast, for example splitting one entity into two.
