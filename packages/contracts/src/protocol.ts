/** What this app reads, sent on every request; separate from an op's schema version (ADR-017). */
export const PROTOCOL_VERSION = 2;

/** Header names, spelled once for both ends. */
export const HEADERS = {
  apiKey: 'X-Api-Key',
  appVersion: 'X-App-Version',
  protocolVersion: 'X-Protocol-Version',
} as const;
