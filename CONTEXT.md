# CONTEXT.md

The glossary of the game logbook: the words used in code, specs, issues and commits. Decisions behind them are in `docs/adr/`.

## Library

- **Game**: a title from the catalog (IGDB), identified by its IGDB id. Catalog data, shared by everyone and never edited by a user.
- **Library entry**: one user's relationship with one game: status, rating, progress, playtime, platform, favourite. Its id is derived from the game's id (ADR-006), so the same game added offline on two devices is one entry.
- **Status**: `wishlist`, `backlog`, `playing`, `paused`, `completed`, `dropped`. Changes follow the transition table in `packages/domain` (`completed` only goes back to `playing`). Checked on local writes only, never on merges.
- **Now Playing**: the entries with status `playing`, shown as a row of image cards on the Library.
- **Favourite**: a flag on an entry, independent of status. The Favourites filter shows favourites of any status.
- **Archive**: entries the user has put away (`archived`); hidden from the Library, kept with their rating and notes. Entries are archived, never deleted.
- **Rating**: an integer 0–100 shown as five stars in half steps (ADR-020, scale moved by ADR-017). **Progress**: the model in ADR-021.
- **Tag**: a user label on an entry, stored normalised (trimmed, collapsed whitespace, lowercase, at most 32 characters).
- **List**: a user-made collection of catalog games ("Co-op with friends"), which can include games the user doesn't track. Items are oldest first; manual ordering is deferred.

## Notes

- **Note item** (a note): playthrough writing attached to a game, typed `puzzle`, `secret`, `npc_hint` or `other`, with an optional location and a resolved flag. Its text never leaves the device except through sync.
- **Open note**: a note item not yet resolved; counted on covers.
- **Note conflict**: the losing side of a concurrent edit to a note's text, kept so no writing is lost (ADR-009). Resolved by the user, never automatically. Its `fromNodeId` is the HLC node id of the device that wrote the losing text, not that device's `deviceId`.

## Sync

- **Op**: one recorded change to one entity, written to the outbox in the same transaction as the row. The unit sync sends.
- **Outbox** (`pending_ops`): ops not yet acknowledged by the server.
- **HLC**: hybrid logical clock (ADR-007); stamps every changed field so devices agree on order without trusting wall clocks.
- **Per-field last-writer-wins**: a merge keeps, field by field, the value with the latest HLC (ADR-008).
- **Tombstone**: a delete recorded as a flag, so it can win or lose against concurrent edits like any field.
- **Merge**: applying a remote op locally. Merges never reject a state; validation is for local writes.
- **Local write**: a change made on this device through `sync`'s commit functions, validated against domain rules.
- **Device**: one install, registered at sign-in, with its own `deviceId` and HLC node id.
- **`sync_state`**: per-device bookkeeping (owner, pull cursor, theme); never synced.
- **Protocol version**: what an app can read, sent on every request (`X-Protocol-Version`). The server serves its own and the one before; outside that, it answers "update required" (ADR-017).
- **Schema version**: the shape of one op's fields, carried on the op (`schemaVersion`).
- **Upcast**: converting an older op to the current schema, at the server's door. **Downcast**: converting current data to an older schema, when serving an older app.
- **Update needed**: the sync state of an app the server no longer serves. Sync stops; everything local keeps working and edits stay queued.
- **Pinned client**: the sync code of an earlier commit, bundled into the repo, so tests run what installed phones run.
- **Poke**: a message on a device's open stream (`/sync/events`) saying its account's log now reaches `seq`, and nothing more. A device behind that position syncs as usual (ADR-011, ADR-012).

## Accounts

- **Signed out**: the default; the app works fully. **Sign-in**: an emailed 6-digit code (ADR-014). **Sign-out** erases the local database.
- **Catalog data vs user data**: kept strictly apart (ADR-016). Catalog is cached server-side from IGDB; user data is per-account.
