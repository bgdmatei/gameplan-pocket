/*
 * Types for the pinned client (client-v2.bundle.js), written by hand and kept
 * apart from today's packages: their types move on, the pinned code doesn't.
 * Only what the N-1 test uses.
 */

export type PinnedAdapter = {
  execute: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
  close: () => Promise<void>;
};

export type PinnedEnv = { now: () => number; randomBytes: (length: number) => Uint8Array };

export type PinnedEntry = { id: string; gameId: number; rating: number | null } & Record<
  string,
  unknown
>;

export type PinnedToken = { kind: 'ok'; token: string } | { kind: 'signed_out' };

declare const pinnedApi: unique symbol;
export type PinnedSyncApi = { readonly [pinnedApi]: true };

export declare const createMigratedNodeAdapter: () => Promise<PinnedAdapter>;

export declare const entryId: (gameId: number) => string;

export declare const commitLocalEdit: (
  adapter: PinnedAdapter,
  env: PinnedEnv,
  edit: {
    entity: 'library_entry';
    id: string;
    update: (current: PinnedEntry) => { next: PinnedEntry; changed: Partial<PinnedEntry> };
  },
) => Promise<unknown>;

export declare const createSyncApi: (config: {
  baseUrl: string;
  appVersion: string;
  auth: {
    accessToken: () => Promise<PinnedToken>;
    rejected: (accessToken: string) => Promise<PinnedToken>;
    end: () => Promise<void>;
  };
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
}) => PinnedSyncApi;

export declare const syncOnce: (deps: {
  adapter: PinnedAdapter;
  env: PinnedEnv;
  api: PinnedSyncApi;
}) => Promise<{ pushed: number; rejected: number; pulled: number; skipped: number }>;
