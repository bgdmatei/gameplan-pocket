# ADR-006: Client-generated IDs

Status: Accepted (2026-09-23, module `sync-core`)

## Context

Every device writes offline, so a new row needs an id before any server has seen it. Two devices must also agree when they create "the same" thing independently: the same game added to the library on a phone and a tablet while both are offline has to become one entry, or the library shows it twice and every later edit targets only one copy.

Sign-in arrives in module 7, after the app already writes entries (module 6), so there is no user id on the device for the first launches.

## Options considered

1. **Server-assigned ids.** Needs a round trip before a row exists; incompatible with offline-first.
2. **Random UUIDs (v4) everywhere.** Offline-safe, but the same game added on two devices becomes two rows, and random keys fragment B-tree indexes.
3. **UUIDv7 for rows with no natural identity, uuidv5 for rows that have one.** Time-ordered random ids index well; deterministic ids make independent creations collide on purpose.

## Decision

Option 3, via the `uuid` package with random bytes passed in by the app.

| What                                      | Id                                                              |
| ----------------------------------------- | --------------------------------------------------------------- |
| Op                                        | UUIDv7 (also the push idempotency key)                          |
| Note item, list, list item, note conflict | UUIDv7                                                          |
| Library entry                             | uuidv5(`gameId`) under a fixed namespace                        |
| Entry tag                                 | uuidv5(`tagIdentityKey(entryId, tag)`) under a second namespace |

Entry ids come from `gameId` **alone**, not `userId + gameId` as the original plan suggested, because no user id exists before sign-in. An entry id is therefore unique only within one user's data: the server keys user tables on `(user_id, id)` and always takes `user_id` from the token.

The device's node id (used in clocks, ADR-007) is also generated on the device, at first write. `auth-identity` registers it rather than assigning one.

## Consequences

- The same game or tag added on two offline devices merges into one row with no special handling.
- Games are archived, never deleted (`SPEC-domain-model.md` decision 12), so re-adding a game finds its old row and un-archives it.
- The namespaces are pinned by a test. Changing one would give every existing entry a new id and split devices apart.
- Server tables need composite keys `(user_id, id)` for entries; a bare `id` primary key would let one user's entry collide with another's.

## Revisit if

Entries become shared between users, or a second kind of library row per game is needed (for example, separate playthroughs of the same game).
