import {
  LIBRARY_ENTRY_TABLES,
  PENDING_OP_TABLES,
  SYNC_STATE_TABLES,
  countPendingOps,
  getSyncState,
  listLibraryGrid,
} from '@gameplan/storage';
import { seed } from '@gameplan/storage/testing';
import { tagId } from '@gameplan/sync';
import catalog from '@gameplan/storage/testing/catalog.json';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase, useEraseDatabase } from '@/data/database';
import { useQuery } from '@/data/use-query';
import { minTouchTarget, radius, space, tabularNumbers, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

const TABLES = [...SYNC_STATE_TABLES, ...PENDING_OP_TABLES, ...LIBRARY_ENTRY_TABLES];

/**
 * What the sync engine thinks, and tools for testing on a real phone. Ships in
 * every build until EAS arrives (tasks/plan.md), and never shows user data:
 * the outbox lists field names, not values.
 */
const DebugScreen = () => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const adapter = useDatabase();
  const erase = useEraseDatabase();
  const [busy, setBusy] = useState<string | null>(null);

  const state = useQuery(
    async (db) => ({
      sync: await getSyncState(db),
      pending: await countPendingOps(db),
      empty: (await listLibraryGrid(db, { limit: 1 })).rows.length === 0,
    }),
    TABLES,
    [],
  );
  const info = state.status === 'ready' ? state.data : null;

  const seedLibrary = async (): Promise<void> => {
    setBusy('Seeding 5,000 games…');
    try {
      // Rows only, no ops: a fake library for measuring, never for syncing.
      await seed(adapter, { catalog, entries: 5_000, tagId });
    } finally {
      setBusy(null);
    }
  };

  const confirmErase = (): void => {
    Alert.alert('Erase everything on this phone?', 'Your library, notes and outbox are deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Erase', style: 'destructive', onPress: () => void erase() },
    ]);
  };

  const row = (label: string, value: string) => (
    <View style={styles.row} key={label}>
      <Text style={[type.subhead, { color: colors.muted }]}>{label}</Text>
      <Text style={[type.subhead, tabularNumbers, { color: colors.text }]} selectable>
        {value}
      </Text>
    </View>
  );

  const action = (label: string, onPress: () => void, enabled = true) => (
    <Pressable
      key={label}
      onPress={onPress}
      disabled={!enabled || busy !== null}
      accessibilityRole="button"
      accessibilityState={{ disabled: !enabled || busy !== null }}
      style={[
        styles.action,
        { backgroundColor: colors.surface, borderColor: colors.line },
        (!enabled || busy !== null) && styles.disabled,
      ]}
    >
      <Text style={[type.body, { color: colors.accent }]}>{label}</Text>
    </Pressable>
  );

  const link = (
    href: '/debug/outbox' | '/debug/storage-check' | '/debug/sync-check',
    label: string,
  ) => (
    <Link key={href} href={href} style={[type.body, styles.link, { color: colors.accent }]}>
      {label}
    </Link>
  );

  return (
    <ScrollView contentContainerStyle={[styles.page, { paddingBottom: space.xl + insets.bottom }]}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        {row('Node id', info?.sync.nodeId ?? 'not yet (created at the first edit)')}
        {row('Last clock', info?.sync.hlcLast ?? 'none')}
        {row('Waiting to sync', info === null ? '…' : `${String(info.pending)} ops`)}
      </View>

      {link('/debug/outbox', 'Outbox')}
      {link('/debug/storage-check', 'Run the storage contract')}
      {link('/debug/sync-check', 'Commit one op on a throwaway database')}

      {busy === null ? null : <Text style={[type.subhead, { color: colors.muted }]}>{busy}</Text>}
      {action('Seed 5,000 real games', () => void seedLibrary(), info?.empty === true)}
      {action('Erase all data on this phone', confirmErase)}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.md },
  card: { borderWidth: 1, borderRadius: radius.card, padding: space.md, gap: space.sm },
  row: { gap: 2 },
  link: { paddingVertical: space.sm },
  action: {
    minHeight: minTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.small,
    borderWidth: 1,
  },
  disabled: { opacity: 0.4 },
});

export default DebugScreen;
