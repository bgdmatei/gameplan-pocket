# ADR-001: pnpm workspaces and Turborepo

Status: Accepted (2026-09-16, module `foundation`). Written up 2026-10-06, at the close of Phase 1.

## Context

One repository holds a React Native app, a Node API, and the packages they share (`domain`, `sync`, `storage`, `db-schema`, `contracts`), with a Next.js web app to follow. It needs workspace linking that Metro and Node both resolve, a task runner that knows the dependency graph between packages, and enough structure to enforce the direction `apps → packages` (ADR-002). One person maintains it, so the tooling has to stay small enough to understand completely.

## Options considered

1. **pnpm workspaces + Turborepo.** pnpm links workspace packages and keeps a strict `node_modules` (a package can't use a dependency it didn't declare). Turborepo runs `typecheck`, `lint`, `test` and `build` in graph order and caches results, configured by one small `turbo.json`.
2. **Nx.** A task runner plus generators, project graph tooling and plugins for React Native, Next.js and Node. More capability, and a larger surface to learn and keep current; its plugins would own parts of the Expo and Metro setup.
3. **npm or Yarn workspaces with plain scripts.** No graph-aware runner and no cache: every check runs everything, in an order kept by hand.

## Decision

Option 1. pnpm (pinned with `packageManager`) for workspaces, Turborepo for tasks, with a local cache only; the remote cache the plan mentions is deferred until CI time makes it worth an account. Package boundaries are not Turborepo's job: `eslint-plugin-boundaries` enforces them, with fixtures proving the rules still fail (`pnpm lint:boundaries`).

## Consequences

- Each package is plain TypeScript source with no build step of its own. Metro resolves it through workspace links; the API bundles it with esbuild for deployment (T16), which is why `apps/api/build.mjs` bundles `@gameplan/*` and leaves npm dependencies external.
- pnpm's strictness surfaced real issues early, at the cost of a few workspace-specific fixes: op-sqlite's build flags (`fts5`) live in the **root** `package.json`, because its build script walks up from `node_modules` to the nearest one, which under pnpm is the workspace root. A native dependency's build scripts must be allowed explicitly (`allowBuilds` in `pnpm-workspace.yaml`).
- Render installs only the API's slice of the workspace (`pnpm install --filter "api..."`), so the server never downloads the mobile app's dependencies.
- If the repository outgrows this (many more apps, generated code, distributed CI), Nx stays an option; nothing here locks it out.
