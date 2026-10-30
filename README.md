# gameplan-pocket

An offline-first game logbook for your phone. Search a catalog of real games (IGDB), add them to your library, set a status (Backlog, Playing, Completed…), rate them, and keep notes on puzzles, secrets and hints while you play. Everything works with no network; the app is built so that the same library can later sync across devices without losing edits.

Expo (React Native) app + Hono API, in a pnpm/Turborepo monorepo, with a hand-written sync engine underneath.

- [Running it](#running-it)
- [Running the tests](#running-the-tests)
- [How it is put together](#how-it-is-put-together)
- [Decisions, and why](#decisions-and-why)
- [What is done, and what is not](#what-is-done-and-what-is-not)

---

## Running it

### Prerequisites

| Tool                           | Why                                                   |
| ------------------------------ | ----------------------------------------------------- |
| Node 24 (`.nvmrc`)             | Everything                                            |
| pnpm 11, via Corepack          | Pinned in `package.json` (`packageManager`)           |
| Docker (OrbStack or Desktop)   | Postgres for the API, and for the API's tests         |
| Xcode + an iOS simulator       | The app uses native modules, so Expo Go cannot run it |
| Twitch developer app (free)    | IGDB is reached with Twitch client credentials        |
| [Maestro](https://maestro.dev) | Optional: the end-to-end flows                        |

Android builds too (`pnpm dev:android`), but iOS is the platform everything was checked on.

### 1. Install

```sh
corepack enable
pnpm install
```

### 2. Start the API

```sh
cd apps/api
cp .env.example .env          # then fill it in, see below
docker compose up -d          # Postgres 17 on :5432
pnpm migrate                  # create the tables
pnpm dev                      # Hono on http://localhost:3000, check /health
```

In `apps/api/.env`:

- `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`: from a Twitch developer application ([dev.twitch.tv/console](https://dev.twitch.tv/console)). The API uses them to talk to IGDB.
- `CATALOG_API_KEY`: any long random string (`openssl rand -hex 24`). The app sends it with every catalog request.
- `JWT_SECRET` and `CODE_SECRET`: `openssl rand -hex 32` each.
- Leave `EMAIL_TRANSPORT=console`: sign-in codes are printed in the API's terminal instead of emailed.

### 3. Start the app

```sh
cd apps/mobile
cp .env.example .env          # EXPO_PUBLIC_API_KEY = the same CATALOG_API_KEY
pnpm dev:ios                  # from the repo root: builds the native app and opens the simulator
```

The first build takes a few minutes. After that, `pnpm dev` (Metro alone) is enough for JavaScript changes.

The simulator reaches your Mac as `localhost`. A physical phone needs the Mac's LAN address in `EXPO_PUBLIC_API_URL`.

### 4. Get some data in

The library starts empty. Either search for a game and add it, or open **Library → Debug (wrench) → Seed 5,000 real games** to fill it with real catalog data: that is the data set the performance numbers were measured on.

Signing in is optional; the app works fully signed out. To try it, go to **Account**, enter any email, and copy the 6-digit code from the API's terminal.

---

## Running the tests

```sh
pnpm test                 # every workspace's Vitest suite (Docker must be running)
pnpm typecheck            # tsc, strict, across every workspace
pnpm lint                 # ESLint, including the architecture rules
pnpm lint:boundaries      # proves the architecture rules still fire (see below)
```

All four pass on `dev` and run in CI on every push and pull request. A change counts as done only when all four pass and Prettier is clean.

`pnpm test` starts a throwaway Postgres container (Testcontainers) for the API's tests, so the first run pulls the image. Without Docker the API's tests stop with a message saying so; the other workspaces don't need it.

Run one workspace with `pnpm --filter <name> test`, e.g. `pnpm --filter @gameplan/sync test`.

### What the tests cover

There are deliberately few tests, and each one pins a rule that could actually break:

- **Domain rules**, such as status transitions and the rating scale, as table-driven tests.
- **Sync convergence as property tests** (fast-check). Random sequences of edits, applied in any order on any number of simulated devices, must end in the same state. Merges are idempotent and commutative, and a delete beats a concurrent edit only when it should.
- **A storage contract**: one suite that any `StorageAdapter` must pass. It runs against Node's SQLite in CI and against op-sqlite on the phone (next section).
- **The API against real Postgres**, including attacks rather than just the happy path. A known and an unknown email get exactly the same answer. A code sent to one address can't sign in another. Another account's device id is refused. A replayed refresh token revokes its whole family. No log line contains an email, a code or a token.
- **Regressions**: a test that a real bug once caused says so in a comment.

Things the tests don't cover: the libraries themselves (zod, SQLite), every field of every schema, or rendering.

### Tests that run on a device

Node's SQLite is more forgiving than the phone's: FTS5 is built into Node but has to be switched on for op-sqlite. So CI alone can't prove the storage layer. Two checks run on the simulator or a phone:

- **Debug → Run the storage contract** runs the same contract suite against the real op-sqlite database inside the app.
- **Maestro flows** in `apps/mobile/e2e/` find controls by their accessibility label, the way VoiceOver reads them:

  ```sh
  # A game added to the library survives a force-quit. Runs on a Release build.
  pnpm --filter mobile ios:staging
  maestro test apps/mobile/e2e/smoke.yaml

  # Walks and screenshots every screen in one theme (needs the seeded library).
  maestro test -e THEME=Dark --test-output-dir out apps/mobile/e2e/screens.yaml
  ```

### Other checks

- `pnpm check:secrets` exports the iOS and Android bundles and searches them for the API's secrets, so "secrets never ship to the app" is checked by a tool rather than taken on trust. It runs as its own CI job.
- `apps/mobile/PERFORMANCE.md` records budgets measured on a phone against the 5,000-game seed (cold start, keystroke to results, filter to grid, scroll fps, heap), including the one budget that was missed and why.

---

## How it is put together

```
apps/
  mobile/       Expo Router app (SDK 57): screens, features, UI kit
  api/          Hono API: IGDB proxy with a Postgres cache, email-code auth
packages/
  domain/       Entities and rules. Pure TypeScript: no React, no I/O, no clock
  sync/         Hybrid logical clock, ops, per-field merges, the local write path
  storage/      StorageAdapter interface; op-sqlite on the phone, Node SQLite in tests
  db-schema/    The phone's SQLite schema and numbered migrations
  contracts/    The wire format shared by the API and the app (zod)
  config/       Shared tsconfig, ESLint and Prettier presets
  test-utils/   Shared test helpers
docs/adr/       Architecture decision records
```

Dependencies only point inward: `apps → packages`, never the reverse, and `domain` imports nothing from the other packages. ESLint enforces this (`eslint-plugin-boundaries`). `pnpm lint:boundaries` keeps fixtures that break the rules on purpose and fails if lint ever stops flagging them, so a rule can't be switched off by accident.

**How a write flows.** A screen calls a commit function in `sync`. It checks the change against the domain rules, stamps each changed field with a hybrid logical clock, and in one SQLite transaction writes both the row and an op describing the change into an outbox. Screens subscribe to reactive queries, so the database's copy re-renders on its own. Screens have no other way to write: storage's own write functions were removed.

---

## Decisions, and why

The full reasoning is in [`docs/adr/`](docs/adr). In short:

- **Offline-first, with the phone as the source of truth.** A game logbook is used on the sofa, on a train, in airplane mode. Every read and write is local SQLite, and the network only ever brings in catalog data or (later) other devices' edits. Nothing waits on a spinner.
- **Build the sync engine rather than adopt one** (ADR-010). The data is small: one user's library, which fits whole on a device, so partial replication (the main reason to buy PowerSync or ElectricSQL) isn't needed. Per-field last-writer-wins with hybrid logical clocks (ADR-007, 008) fits it, and correctness rests on the property tests. The ADR is candid that for a team shipping to many users, buying would save months. Here, building it is part of the point: the project is practice in architecture and system design.
- **Sync-ready from the first write.** Every local change already records its clock and its op, even though nothing is sent anywhere yet. Adding sync later is then a transport problem, not a data migration on every phone.
- **IDs are made on the device** (ADR-006). They have to be, because rows are created offline, before any server or sign-in exists. A library entry's id is derived from the game's id, so two phones that add the same game offline end up with the same row, not a duplicate.
- **Validate local writes, never merges.** The status rules (for example, a Completed game can only go back to Playing) apply to what this user is doing now. A merge that rejected a remote state would leave two devices that never agree.
- **op-sqlite rather than expo-sqlite** (ADR-003). It runs queries off the JS thread, so scrolling doesn't stutter, and it lets SQLite's build options be chosen, FTS5 among them, for search on every keystroke. On a 5,000-game library a keystroke reaches local results in 16 ms.
- **Share logic, not UI** (ADR-002). The web app planned for later is its own Next.js app sharing `domain`, `storage` and `sync`. It is not React Native Web. The domain is kept pure so it runs unchanged anywhere.
- **The API is a thin, cached proxy to IGDB** (ADR-015, 016), so the app never holds Twitch credentials. Catalog data lives in Postgres, rate-limited to IGDB's 4 requests per second, with fuzzy matching (`pg_trgm`). User data and catalog data are kept strictly apart.
- **Email codes, not passwords** (ADR-014). Short-lived JWTs, rotating refresh tokens with reuse detection, and tokens kept in the Keychain. Going offline never signs you out.
- **Hono rather than Fastify** (ADR-022): small, built on the web-standard Request and Response, and routes can be tested in memory without a server. Moving to an edge runtime later would mostly be a change of adapter.
- **pnpm and Turborepo** (ADR-001): strict dependency resolution, so packages can't use what they don't declare, plus cached task graphs.
- **Privacy rules set early, because they're cheap now and hard to retrofit.** Note text never leaves the phone except through sync: it is kept out of logs and error reports. Signing out erases the local database rather than just closing it. The server will accept only allowlisted columns from a client, and the user id always comes from the token.
- **Few, meaningful tests** over a high count or a coverage target. Rules, invariants as property tests, attacks on every exposed surface, and every real bug pinned.

---

## What is done, and what is not

The project is planned as 15 modules (foundation → domain → storage → sync core → catalog → mobile library → auth → visual design → sync transport → realtime → conflicts → schema evolution → Steam import → stats → web).

**Done:** the foundation, domain model, storage adapter, offline sync core, catalog service, the mobile library app (search, library grid and filters, game detail, notes, archive), and auth. A staging API runs on Render with Neon Postgres.

**In progress:** a visual redesign of every screen, in light and dark.

**Not yet:** syncing between devices (the transport, the server's op log, realtime pokes and the conflict UI for notes). Each device already records everything sync will need. Steam import, stats, and the web app are not started either.
