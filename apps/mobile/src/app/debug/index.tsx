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
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase, useEraseDatabase } from '@/data/database';
import {
  BUDGETS,
  METRICS,
  getHeapBaseline,
  jsHeapBytes,
  perfSummary,
  resetPerf,
  setHeapBaseline,
} from '@/data/perf';
import type { Metric, Summary } from '@/data/perf';
import { useQuery } from '@/data/use-query';
import { fonts, minTouchTarget, radius, space, tabularNumbers, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

const TABLES = [...SYNC_STATE_TABLES, ...PENDING_OP_TABLES, ...LIBRARY_ENTRY_TABLES];

const METRIC_LABEL: Record<Metric, string> = {
  coldStart: 'Cold start (JS)',
  search: 'Keystroke → results',
  filter: 'Filter → grid',
  write: 'Edit → saved on screen',
  scrollFps: 'Grid scroll (JS fps)',
};

const round = (value: number): string => String(Math.round(value));

/** "median 12 · worst 31 ms (budget 50, met)", or a note that nothing was measured yet. */
const describe = (metric: Metric, summary: Summary): string => {
  const { limit, unit, better } = BUDGETS[metric];
  if (summary.median === null || summary.worst === null)
    return `not measured (budget ${String(limit)} ${unit})`;
  const met = better === 'lower' ? summary.worst <= limit : summary.worst >= limit;
  return `median ${round(summary.median)} · worst ${round(summary.worst)} ${unit} · ${String(summary.count)} runs (budget ${String(limit)}, ${met ? 'met' : 'MISSED'})`;
};

const megabytes = (bytes: number | null): string =>
  bytes === null ? 'not reported' : `${(bytes / 1_048_576).toFixed(1)} MB`;

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
  // Samples live outside React: read them again whenever this screen shows.
  const [, setReadAt] = useState(0);
  const refresh = useCallback(() => setReadAt(Date.now()), []);
  useFocusEffect(refresh);
  const summary = perfSummary();
  const heap = jsHeapBytes();
  const baseline = getHeapBaseline();

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
      {/* Embedded fonts check (visual-design T1): serif here means the plugin worked. */}
      <Text style={[styles.fontCheck, { color: colors.text }]}>
        Fraunces: Protecting your peace
      </Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        {row('Node id', info?.sync.nodeId ?? 'not yet (created at the first edit)')}
        {row('Last clock', info?.sync.hlcLast ?? 'none')}
        {row('Waiting to sync', info === null ? '…' : `${String(info.pending)} ops`)}
      </View>

      <Text style={[type.label, { color: colors.muted }]} accessibilityRole="header">
        PERFORMANCE (T19)
      </Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        {METRICS.map((metric) => row(METRIC_LABEL[metric], describe(metric, summary[metric])))}
        {row(
          'JS heap',
          `${megabytes(heap)} now · baseline ${baseline === null ? 'not set' : megabytes(baseline)}${
            heap !== null && baseline !== null ? ` · change ${megabytes(heap - baseline)}` : ''
          }`,
        )}
      </View>
      {action('Refresh numbers', refresh)}
      {action('Reset heap baseline', () => {
        setHeapBaseline();
        refresh();
      })}
      {action('Clear timings', () => {
        resetPerf();
        refresh();
      })}

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
  fontCheck: { fontFamily: fonts.serif, fontSize: 24, lineHeight: 30 },
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
