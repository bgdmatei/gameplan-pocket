# ADR-022: Hono for the API, not Fastify

Status: Accepted (2026-09-17, module `foundation`). Written up 2026-10-06, at the close of Phase 1. Plan §3 lists this decision for Phase 1; ADR numbers 001–019 were already assigned to other decisions (`SPEC-map.md`), so it takes the next free one.

## Context

`apps/api` serves the catalog now (module 5) and sync, auth and realtime pokes later (modules 7–9). It is small, maintained by one person, validates every request and response with zod schemas shared with the app (`@gameplan/contracts`, ADR-002), and has to be easy to test without starting a server. It runs on Node today (Render, T16).

## Options considered

1. **Hono.** A small router built on the web standard `Request` and `Response`, running on Node through `@hono/node-server` and on edge runtimes unchanged. `app.request()` answers a request in memory, so a route test needs no server or port.
2. **Fastify.** Mature, fast, Node-only, with a large plugin ecosystem (auth, rate limiting, OpenAPI, SSE) and its own JSON-schema validation and serialisation built in.
3. **Express.** The familiar default, but slower, callback-era, and its types and async error handling need extra packages.

## Decision

Option 1, Hono. Validation stays with zod through `@gameplan/contracts`, so the API and the app parse the same shapes; Fastify's schema system would have been a second definition of them.

## Consequences

- Route tests call `app.request()` directly (`routes.test.ts`, `secrets.test.ts`): the API-key attack cases and the catalog routes run in memory, fast enough for every push.
- Handlers use web-standard types, so moving to an edge runtime later is mostly a change of adapter, not of routes. Not entirely: the API-key check uses `node:crypto` (`timingSafeEqual`), which would need the Web Crypto equivalent.
- Fastify's ready-made plugins are what we give up. Auth, rate limiting and SSE (modules 7–9) will use Hono's smaller middleware or code of our own; if those modules struggle, that is the moment to revisit this decision.
- The API is deployed as an esbuild bundle running on Node (ADR-001, T16); Hono adds nothing special to that build.
