import { migrate } from '@gameplan/db-schema';
import type { StorageAdapter } from '@gameplan/storage';
import { createOpSqliteAdapter } from '@gameplan/storage/op-sqlite';
import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { space, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

const DatabaseContext = createContext<StorageAdapter | null>(null);

type Opening =
  { kind: 'opening' } | { kind: 'ready'; adapter: StorageAdapter } | { kind: 'failed' };

/**
 * Opens the app's one database and brings it to the latest schema before
 * anything reads it. Screens render from SQLite straight after (plan §12.4:
 * render cached data first); nothing here waits on the network.
 */
export const DatabaseProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<Opening>({ kind: 'opening' });
  const { colors } = useTheme();

  useEffect(() => {
    const adapter = createOpSqliteAdapter();
    migrate(adapter)
      .then(() => setState({ kind: 'ready', adapter }))
      .catch((error: unknown) => {
        // A migration error names the failing statement, never a row's values,
        // so it is safe to log (CLAUDE.md §Privacy rules).
        console.warn('Database failed to open:', error instanceof Error ? error.message : error);
        setState({ kind: 'failed' });
      });

    return () => {
      void adapter.close();
    };
  }, []);

  if (state.kind === 'ready') {
    return <DatabaseContext.Provider value={state.adapter}>{children}</DatabaseContext.Provider>;
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

/** The app's database. Only usable below `DatabaseProvider`, which renders nothing else until it is open. */
export const useDatabase = (): StorageAdapter => {
  const adapter = useContext(DatabaseContext);
  if (adapter === null) throw new Error('useDatabase is used outside DatabaseProvider.');
  return adapter;
};

const styles = StyleSheet.create({
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
});
