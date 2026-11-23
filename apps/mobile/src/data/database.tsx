import { migrate } from '@gameplan/db-schema';
import type { StorageAdapter } from '@gameplan/storage';
import { pruneCatalog } from '@gameplan/storage';
import { createOpSqliteAdapter } from '@gameplan/storage/op-sqlite';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, InteractionManager, StyleSheet, Text, View } from 'react-native';
import { space, type } from '@/ui/theme';
import { clearCovers } from './cover-store';
import { useTheme } from '@/ui/use-theme';

type Database = {
  adapter: StorageAdapter;
  /**
   * Destroys everything on this phone and opens an empty database in its
   * place. The debug menu's reset today; signing out in `auth-identity`
   * (module 7), which must leave nothing behind (CLAUDE.md §Privacy rules).
   * Resolves with the new database once it is open.
   */
  erase: () => Promise<StorageAdapter>;
};

const DatabaseContext = createContext<Database | null>(null);

type Opening =
  { kind: 'opening' } | { kind: 'ready'; adapter: StorageAdapter } | { kind: 'failed' };

/**
 * Opens the app's one database and brings it to the latest schema before
 * anything reads it. Screens render from SQLite straight after (plan §12.4:
 * render cached data first); nothing here waits on the network.
 */
export const DatabaseProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<Opening>({ kind: 'opening' });
  // Bumped by `erase`, which opens a fresh database.
  const [generation, setGeneration] = useState(0);
  const reopened = useRef<{
    resolve: (adapter: StorageAdapter) => void;
    reject: (error: unknown) => void;
  } | null>(null);
  const { colors } = useTheme();

  useEffect(() => {
    const adapter = createOpSqliteAdapter();
    migrate(adapter)
      .then(() => {
        setState({ kind: 'ready', adapter });
        reopened.current?.resolve(adapter);
        reopened.current = null;
        // After the first frame, not before it (plan §12.4): drops cached games
        // that are not in the library and were not viewed in the last 30 days.
        InteractionManager.runAfterInteractions(() => {
          const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
          void pruneCatalog(adapter, { keepFetchedSince: monthAgo }).catch(() => undefined);
        });
      })
      .catch((error: unknown) => {
        // A migration error names the failing statement, never a row's values,
        // so it is safe to log (CLAUDE.md §Privacy rules).
        console.warn('Database failed to open:', error instanceof Error ? error.message : error);
        setState({ kind: 'failed' });
        reopened.current?.reject(error);
        reopened.current = null;
      });

    return () => {
      void adapter.close();
    };
  }, [generation]);

  if (state.kind === 'ready') {
    const erase = async (): Promise<StorageAdapter> => {
      setState({ kind: 'opening' });
      await state.adapter.destroy();
      try {
        clearCovers();
      } catch {
        // The fresh database still opens; covers left behind are retried at
        // the next erase rather than leaving the app on a spinner.
        console.warn('Stored covers could not be cleared.');
      }
      const opened = new Promise<StorageAdapter>((resolve, reject) => {
        reopened.current = { resolve, reject };
      });
      setGeneration((current) => current + 1);
      return opened;
    };

    return (
      <DatabaseContext.Provider value={{ adapter: state.adapter, erase }}>
        {children}
      </DatabaseContext.Provider>
    );
  }

  return (
    <View style={[styles.centred, { backgroundColor: colors.background }]}>
      {state.kind === 'opening' ? (
        <ActivityIndicator color={colors.accent} accessibilityLabel="Opening your library" />
      ) : (
        <Text style={[type.body, { color: colors.text }]}>
          Your library could not be opened. Close the app completely and open it again.
        </Text>
      )}
    </View>
  );
};

const useDatabaseContext = (): Database => {
  const database = useContext(DatabaseContext);
  if (database === null) throw new Error('Used outside DatabaseProvider.');
  return database;
};

/** The app's database. Only usable below `DatabaseProvider`, which renders nothing else until it is open. */
export const useDatabase = (): StorageAdapter => useDatabaseContext().adapter;

/** See `Database.erase`. */
export const useEraseDatabase = (): (() => Promise<StorageAdapter>) => useDatabaseContext().erase;

const styles = StyleSheet.create({
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
});
