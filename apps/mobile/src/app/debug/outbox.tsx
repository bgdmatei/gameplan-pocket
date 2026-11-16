import {
  PENDING_OP_TABLES,
  REJECTED_OP_TABLES,
  SYNC_STATE_TABLES,
  getSyncState,
  listPendingOps,
  listRejectedOps,
} from '@gameplan/storage';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@/data/use-query';
import { useSyncStatus } from '@/features/sync/use-sync-status';
import { space, tabularNumbers, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

type OpSummary = { id: string; entity: string; kind: string; fields: string[]; at: string };

/**
 * Names only, never values: a note's text travels inside its op's payload,
 * and this screen must not be the one place it leaks (CLAUDE.md §Privacy).
 */
const summarise = (payload: string, id: string, at: string): OpSummary => {
  const parsed: unknown = JSON.parse(payload);
  const op = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<
    string,
    unknown
  >;
  const fields = typeof op.fields === 'object' && op.fields !== null ? Object.keys(op.fields) : [];
  return {
    id,
    entity: typeof op.entity === 'string' ? op.entity : '?',
    kind: typeof op.type === 'string' ? op.type : '?',
    fields,
    at,
  };
};

/**
 * Sync as the engine sees it: its state, the last pull and the last error,
 * ops the server refused (id, entity and reason: a refused op's payload is
 * never read here), then what is still queued.
 */
const SyncSummary = () => {
  const { colors } = useTheme();
  const status = useSyncStatus();
  const state = useQuery(
    async (db) => ({
      lastPulledSeq: (await getSyncState(db)).lastPulledSeq,
      // Newest first, and a screenful: a clock storm can refuse thousands.
      rejected: (await listRejectedOps(db)).reverse(),
    }),
    [...SYNC_STATE_TABLES, ...REJECTED_OP_TABLES],
    [],
  );
  if (state.status !== 'ready') return null;
  const { lastPulledSeq, rejected } = state.data;
  const shown = rejected.slice(0, 50);
  const line = (text: string) => (
    <Text style={[type.subhead, tabularNumbers, { color: colors.muted }]}>{text}</Text>
  );

  return (
    <View style={styles.summary}>
      <Text style={[type.headline, { color: colors.text }]}>Sync: {status.phase}</Text>
      {line(`Last pull: position ${String(lastPulledSeq)}, ${status.lastSyncedAt ?? 'never'}`)}
      {line(
        status.lastError === null
          ? 'Last error: none'
          : `Last error: ${status.lastError.kind}, ${status.lastError.at}`,
      )}
      <Text style={[type.headline, styles.heading, { color: colors.text }]}>
        Refused by the server ({String(rejected.length)})
      </Text>
      {shown.map((op) => (
        <View key={op.id} style={[styles.item, { borderBottomColor: colors.line }]}>
          <Text style={[type.subhead, { color: colors.text }]}>
            {op.entity} · {op.reason}
          </Text>
          <Text style={[type.caption, tabularNumbers, { color: colors.muted }]}>
            {op.id} · {op.rejectedAt}
          </Text>
        </View>
      ))}
      <Text style={[type.headline, styles.heading, { color: colors.text }]}>Waiting to sync</Text>
    </View>
  );
};

const OutboxScreen = () => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const state = useQuery(
    async (db) =>
      (await listPendingOps(db, { limit: 500 }))
        .map((op) => summarise(op.payload, op.id, op.createdAt))
        .reverse(),
    PENDING_OP_TABLES,
    [],
  );

  if (state.status !== 'ready') return null;

  return (
    <FlatList
      data={state.data}
      keyExtractor={(op) => op.id}
      contentContainerStyle={[styles.list, { paddingBottom: space.xl + insets.bottom }]}
      ListHeaderComponent={<SyncSummary />}
      ListEmptyComponent={
        <Text style={[type.body, { color: colors.muted }]}>Nothing waiting to sync.</Text>
      }
      renderItem={({ item }) => (
        <View style={[styles.item, { borderBottomColor: colors.line }]}>
          <Text style={[type.headline, { color: colors.text }]}>
            {item.entity} · {item.kind}
          </Text>
          {item.fields.length === 0 ? null : (
            <Text style={[type.subhead, { color: colors.muted }]}>{item.fields.join(', ')}</Text>
          )}
          <Text style={[type.caption, tabularNumbers, { color: colors.muted }]}>{item.at}</Text>
        </View>
      )}
    />
  );
};

const styles = StyleSheet.create({
  list: { padding: space.lg },
  item: { paddingVertical: space.md, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth },
  summary: { gap: space.xs, paddingBottom: space.sm },
  heading: { paddingTop: space.lg },
});

export default OutboxScreen;
