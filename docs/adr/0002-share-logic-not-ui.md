# ADR-002: Share logic, not UI

Status: Accepted (2026-09-17, module `foundation`). Written up 2026-10-06, at the close of Phase 1.

## Context

The product has a phone app (Expo) and, later, a web app (module 14). Both show the same library and write the same edits, and both must merge them identically, or devices stop converging. The question is how much of the code the two share: only the rules and data layer, or the screens as well.

## Options considered

1. **Share logic, not UI.** Domain rules, the sync engine, the storage interface, the client schema and the API contracts live in packages. Each app builds its own screens with its own platform's components.
2. **One UI kit across both: Tamagui.** Shared components that compile to native views and to the web. Saves writing screens twice, but every screen depends on the kit's styling model, and its compiler joins the build of both apps.
3. **The mobile app on the web via react-native-web,** optionally with Solito for routing. One codebase, but the web app becomes a phone app in a browser: SSR, SEO for public list pages, and keyboard-first navigation all fight the abstraction.

## Decision

Option 1. `packages/domain`, `sync`, `storage`, `db-schema` and `contracts` are shared; `apps/mobile` and the future `apps/web` own their UI. The rules that keep this honest are enforced, not hoped for:

- Dependency direction `apps → packages` only (`eslint-plugin-boundaries`, with fixtures in `scripts/check-boundaries.mjs` proving a violation still fails).
- `packages/domain` is pure: no React, React Native, Expo, Hono, Node built-ins, clock or randomness (its own ESLint config). Time and ids are parameters.
- No React in `domain`, `sync` or `storage`, so they run in plain Node: the API reuses them, and their tests need no device.

## Consequences

- Everything that decides whether data is correct is written and tested once: status transitions, merges, the op allowlist, the client schema. The phone and the future web app cannot disagree about a merge.
- Screens are written twice. The mobile screens of module 6 are not reusable by the web app; its design tokens may be shared later, as data, if that proves useful.
- react-native-web is deliberately absent from the repository, and `pnpm dev:web` points at the future Next.js app rather than the phone app in a browser (README).
- New platform rules, like which platforms a game can be played on (Steam Deck, spec decision 20), go in `domain` as pure functions, so both clients get them.
