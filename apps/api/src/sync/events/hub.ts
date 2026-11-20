/** Past this, an account's oldest stream is closed for the new one. */
export const MAX_STREAMS_PER_ACCOUNT = 10;

export type PokeStream = {
  deviceId: string;
  poke: (seq: number) => void;
  /** Ends the stream; it unregisters itself as it closes. */
  close: () => void;
};

export type PokeHub = {
  /** Returns the unregister function. */
  register: (userId: string, stream: PokeStream) => () => void;
  deliver: (userId: string, seq: number) => void;
  /** Accounts with at least one open stream. */
  accounts: () => string[];
};

/**
 * One per API process: which open streams belong to which account. A device
 * holds one stream: a new one replaces its older one, as after a dropped
 * connection the server hasn't noticed yet.
 */
export const createPokeHub = (): PokeHub => {
  // Sets keep insertion order, so the first is the oldest.
  const streams = new Map<string, Set<PokeStream>>();

  return {
    accounts: () => [...streams.keys()],
    register: (userId, stream) => {
      const own = streams.get(userId) ?? new Set();
      streams.set(userId, own);
      const evict = (old: PokeStream) => {
        own.delete(old);
        try {
          old.close();
        } catch {
          // Already closing; a throw here would leave the new stream half-registered.
        }
      };
      for (const open of own) if (open.deviceId === stream.deviceId) evict(open);
      for (const open of own) {
        if (own.size < MAX_STREAMS_PER_ACCOUNT) break;
        evict(open);
      }
      own.add(stream);
      return () => {
        own.delete(stream);
        if (own.size === 0 && streams.get(userId) === own) streams.delete(userId);
      };
    },
    // Runs inside pg's socket handler: a throw would skip the account's other
    // streams and surface as an uncaught exception.
    deliver: (userId, seq) => {
      for (const stream of streams.get(userId) ?? []) {
        try {
          stream.poke(seq);
        } catch {
          // A stream that can't take a poke is closing; its own cleanup unregisters it.
        }
      }
    },
  };
};
