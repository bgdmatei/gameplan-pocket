/**
 * The wire protocol's version, separate from any entity's schema version
 * (plan §11). Every request carries it, so the server can serve old clients
 * once `schema-evolution` (module 11) needs to.
 */
export const PROTOCOL_VERSION = 1;

/** Header names, spelled once for both ends. */
export const HEADERS = {
  apiKey: 'X-Api-Key',
  appVersion: 'X-App-Version',
  protocolVersion: 'X-Protocol-Version',
} as const;
