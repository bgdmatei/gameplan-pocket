export type PokeHub = {
  /** Returns the unregister function. */
  register: (userId: string, poke: (seq: number) => void) => () => void;
  deliver: (userId: string, seq: number) => void;
};

/** One per API process: which open streams belong to which account. */
export const createPokeHub = (): PokeHub => {
  const streams = new Map<string, Set<(seq: number) => void>>();

  return {
    register: (userId, poke) => {
      const own = streams.get(userId) ?? new Set();
      own.add(poke);
      streams.set(userId, own);
      return () => {
        own.delete(poke);
        if (own.size === 0 && streams.get(userId) === own) streams.delete(userId);
      };
    },
    // Runs inside pg's socket handler: a throw would skip the account's other
    // streams and surface as an uncaught exception.
    deliver: (userId, seq) => {
      for (const poke of streams.get(userId) ?? []) {
        try {
          poke(seq);
        } catch {
          // A stream that can't take a poke is closing; its own cleanup unregisters it.
        }
      }
    },
  };
};
