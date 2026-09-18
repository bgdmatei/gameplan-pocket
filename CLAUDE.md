# CLAUDE.md

Instructions for Claude Code working in this repo. Add new rules as they come up — keep them short, and say _why_ when the reason isn't obvious.

## What this project is

Offline-first, multi-device game logbook: Expo (React Native) + Hono API + a custom sync engine, in a pnpm/Turborepo monorepo. Mobile ships before web.

## Planning documents (read before starting work)

| File                     | Purpose                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `SPEC-map.md`            | Capability map: the 14 modules, dependencies, build order. The index of what exists |
| `SPEC-<module-id>.md`    | One approved spec per module (`SPEC-foundation.md`, `SPEC-domain-model.md`)         |
| `tasks/plan.md`          | Implementation plan for the module in progress                                      |
| `tasks/todo.md`          | Its ordered task list; tick tasks off as they land                                  |
| `tasks/archive/`         | Plans and task lists from finished modules                                          |
| `game-logbook-plan.html` | The original architecture plan; authoritative for design decisions                  |

Work follows spec → plan → tasks → implement, with a human review gate between phases. Don't start a module without an approved spec, and don't overwrite a plan that still has unchecked tasks — archive it instead.

`*.md` is gitignored (see `.gitignore`), so specs and plans stay local. `CLAUDE.md` is the exception and is versioned.

## Commands

```sh
pnpm install
pnpm typecheck            # turbo: tsc across all workspaces
pnpm lint                 # turbo: eslint
pnpm lint:boundaries      # asserts the boundary fixtures still fail lint
pnpm test                 # turbo: vitest with coverage thresholds
pnpm build
pnpm --filter api dev     # Hono on :3000 (/health)
pnpm --filter mobile start
pnpm exec prettier --check <paths>
```

## Definition of done

A task is done when `pnpm typecheck && pnpm lint && pnpm lint:boundaries && pnpm test` pass and Prettier is clean on changed files.

**Never judge a command by truncated output.** `| tail -3` once hid a typecheck failure behind a success-looking summary. Grep for `error`, `Failed`, `ERROR`, or check the exit code.

## Architecture rules

- Dependency direction: `apps → packages`. Packages never import apps. Enforced by `eslint-plugin-boundaries` plus fixtures in `scripts/check-boundaries.mjs`.
- `packages/domain` is pure: no React, React Native, Expo, Hono, Node built-ins, and no other workspace package. No clock and no randomness either — time and IDs are parameters. Enforced in `packages/domain/eslint.config.js`.
- Domain knows nothing about HLCs, ops, IDs or persistence; those belong to `sync-core` and `storage-adapter`.
- Sync merges must never reject a state. Validation (status transitions, cross-field rules) applies only to local writes, or devices stop converging.
- New packages: `@gameplan/` scope, `private: true`, tsconfig extending `@gameplan/config`, created by the module that first needs them.

## Code conventions

- TypeScript strict, `noUncheckedIndexedAccess`, no `any` — use `unknown` and narrow.
- ESM. Named exports only; no default exports in packages.
- Filenames kebab-case; types PascalCase; functions and variables camelCase.
- Prettier: single quotes, width 100.
- Types are inferred from zod schemas (`z.infer`), never hand-written twice.
- Tests are colocated as `*.test.ts` / `*.property.test.ts`.
- Always use `const` arrow functions — every function and every component. No `function` declarations.
- Never use `any` type — always define proper types

## Testing

- Vitest for unit tests, fast-check for property tests, both installed at the root.
- Write the test first, watch it fail, then implement.
- Coverage thresholds live in each package's `vitest.config.ts` and are not to be lowered to get a green run.
- Verify a guard by breaking it on purpose (a violating fixture, a weakened rule) and confirming the check fails. A guard that has never failed hasn't been tested.

## Git

- Work on `dev`. `main` only via pull request, after a module's success criteria are met.
- Commit only when asked.
- Conventional subject (`feat(domain): …`, `ci: …`, `docs: …`) plus a body explaining _why_, wrapped at ~72 characters. Note anything unrelated that rides along in the same commit.
- End commit messages with: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- Don't rename CI job names casually — branch protection matches required checks by name.
- Never use `--no-verify`, and never push straight to `main`.

## Ask first

- Adding a dependency, especially at the root.
- Changing `turbo.json` pipelines, boundary rules, or CI structure.
- Changing an approved spec's data contracts (status transitions, rating scale, field limits).
- Anything that weakens a check: lowering coverage, disabling a lint rule, skipping a test.

## Working with me

I'm building this to practise architecture and system design, so:

- Before introducing a new library, pattern, folder structure, or data-model change: propose 2–3 options with tradeoffs and **wait for my choice**. Don't implement first.
- For routine code within an agreed pattern, just do it.
- Keep diffs small and scoped to the task. No drive-by refactors.
- If you think a decision above is wrong, say so and explain why. Don't silently work around it.

## Don't

- Don't add dependencies without asking.
