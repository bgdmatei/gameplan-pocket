# ADR-016: Catalog data and user data are separate

Status: Accepted (2026-09-23, module `catalog-service`)

## Context

The app holds two kinds of data. **Catalog data** is facts about games (name, cover, release date, genres, platforms), the same for everyone and owned by IGDB. **User data** is a person's library, ratings, tags, notes and lists, private and edited offline on several devices. They change for different reasons, have different owners, and need different guarantees.

## Options considered

1. **One model:** catalog fields copied into each library entry and synced with it.
2. **Separate stores:** catalog cached read-only and server-authoritative; user data synced with ops and merge rules; the two joined by `gameId`.

## Decision

Option 2.

- **Catalog:** the server fetches from IGDB and caches in Postgres (ADR-015). Clients cache the games they show in their own read-only tables (`games`, `genres`, `platforms`) and never edit them. A newer server copy simply replaces the local one; there is nothing to merge.
- **User data:** synced through ops, clocks and per-field merge (ADR-006 to 008). It refers to the catalog by `gameId` only.
- **The contract** between server and client is the domain's `Game`, `Genre` and `Platform` schemas, so both sides validate with the same code.
- Catalog responses are public data and carry no user id. User data is always scoped by the token's user.

## Consequences

- Sync never carries game metadata, so ops stay small and IGDB corrections never conflict with user edits.
- A library entry can reference a game the device has not cached yet (added on another device). The batch lookup (`/catalog/games?ids=`) fills that in.
- Deleting or refreshing catalog data never touches anyone's library.

## Revisit if

Users need to edit game facts (custom titles, platforms IGDB lacks). That data belongs to the user and would become a synced entity of its own, not an edit of the catalog.
