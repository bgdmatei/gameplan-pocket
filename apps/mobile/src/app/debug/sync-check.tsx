import { migrate } from '@gameplan/db-schema';
import { createList } from '@gameplan/domain';
import { getSyncState, listPendingOps } from '@gameplan/storage';
import { createOpSqliteAdapter } from '@gameplan/storage/op-sqlite';
import { commitLocalCreate, newId } from '@gameplan/sync';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { syncEnv } from '@/data/env';
import { space, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

type Result = { ok: true; lines: string[] } | { ok: false; message: string };

/**
 * Commits one real op on Hermes: UUIDv7 ids and the node id from expo-crypto's
 * random bytes, an HLC tick, and the outbox write, through op-sqlite. None of
 * that had run on the phone before (SPEC-sync-core.md, device check).
 *
 * It uses a throwaway database, destroyed afterwards, so the test op never
 * reaches the real outbox or, later, the server.
 */
const run = async (): Promise<Result> => {
  const adapter = createOpSqliteAdapter({ name: `sync-check-${String(Date.now())}.db` });
  try {
    await migrate(adapter);
    const nowMs = syncEnv.now();
    const list = createList({
      id: newId(syncEnv.randomBytes, nowMs),
      name: 'Sync check',
      createdAt: new Date(nowMs).toISOString(),
    });

    const op = await commitLocalCreate(adapter, syncEnv, { entity: 'list', next: list });
    const [pending] = await listPendingOps(adapter);
    const state = await getSyncState(adapter);

    if (pending?.id !== op.id || state.hlcLast !== op.hlc) {
      return { ok: false, message: 'The outbox or the clock state does not match the op.' };
    }
    return {
      ok: true,
      lines: [`op id ${op.id}`, `hlc ${op.hlc}`, `node ${state.nodeId ?? 'none'}`],
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  } finally {
    await adapter.destroy();
  }
};

const SyncCheckScreen = () => {
  const { colors } = useTheme();
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    void run().then(setResult);
  }, []);

  if (result === null) {
    return (
      <View style={styles.page}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <Text style={[type.title, { color: result.ok ? colors.text : colors.danger }]}>
        {result.ok ? 'One op committed on this phone' : 'The sync check failed'}
      </Text>
      {(result.ok ? result.lines : [result.message]).map((line) => (
        <Text key={line} style={[type.subhead, { color: colors.muted }]}>
          {line}
        </Text>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', padding: space.xl, gap: space.sm },
});

export default SyncCheckScreen;
