import { PENDING_OP_TABLES, listPendingOps } from '@gameplan/storage';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@/data/use-query';
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
});

export default OutboxScreen;
