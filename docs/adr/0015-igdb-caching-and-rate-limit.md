# ADR-015: IGDB caching and rate limiting

Status: Accepted (2026-09-23, module `catalog-service`)

## Context

Game data comes from IGDB, which needs a Twitch app's credentials and allows 4 requests per second and 8 open requests per app (a 429 above that). Every user shares that one budget. The app is offline-first, so a slow or unavailable IGDB must never break a screen, and the Twitch secret must never reach a client.

## Options considered

1. **Clients call IGDB directly.** Impossible without shipping the secret, and every client would compete for one rate limit it cannot see.
2. **Server proxies every request to IGDB, no cache.** Simple, but each search spends the shared budget and fails whenever IGDB does.
3. **Server proxy with a Postgres cache, one rate-limited queue, and stale fallback.**

## Decision

Option 3.

- **One queue per process:** a sliding window of 4 starts per second (a token bucket of 4 would let 7 start within one second), 8 in flight and 20 waiting. A request that would wait beyond that is refused immediately, so a flood of searches cannot build a backlog.
- **Cache first.** A normalised search seen within 24 h is answered from Postgres. Otherwise a fuzzy name search (`pg_trgm` word similarity) runs, and IGDB is asked only when fewer than 5 good matches exist. Batch lookups fetch every missing id in one request.
- **Stale, never broken.** If IGDB errors, rate-limits, times out or the queue is full, the response is the cache with `stale: true` and status 200. A database failure still surfaces as an error: hiding our own outage would be worse than showing it.
- **Search text is sanitised by removal**: `"` and `\` are removed rather than escaped, so the result does not depend on how IGDB's parser treats escapes.
- **The secret lives in server env only**, travels in the token request's POST body, and failures report status codes, never bodies. A test echoes the secret back from fake Twitch and IGDB and asserts no log or response contains it; `pnpm check:secrets` searches the built mobile bundles.
- Images are not proxied: clients build IGDB image URLs from the stored `image_id`.

## Consequences

- Popular searches cost IGDB nothing after the first; the budget goes to new queries.
- A result can be up to a day old. There is no freshness job yet.
- With several API instances the per-process queue would multiply the request rate. Then the bucket moves to Postgres, or one worker owns IGDB access.

## Revisit if

More than one API instance runs, IGDB changes its limits, or cached data proves stale enough that users notice (then add the freshness job and `/catalog/changes`, for which `catalog_version` is already recorded).
