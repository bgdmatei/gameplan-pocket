import { migrate } from '@gameplan/db-schema';
import { createList } from '@gameplan/domain';
import { countPendingOps, getSyncState, listPendingOps } from '@gameplan/storage';
import type { StorageAdapter } from '@gameplan/storage';
import { createOpSqliteAdapter } from '@gameplan/storage/op-sqlite';
import { commitLocalCreate, commitLocalDelete, newId } from '@gameplan/sync';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { catalogApi } from '@/data/catalog-api';
import { useDatabase } from '@/data/database';
import { syncEnv } from '@/data/env';
import { SyncRequestError } from '@/data/sync-api';
import { session } from '@/features/account/auth-client';
import { runSync } from '@/features/sync/run-sync';
import { syncApi } from '@/features/sync/sync-client';
import { space, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

type Result = { ok: true; lines: string[] } | { ok: false; message: string };

const failure = (error: unknown): Result => ({
  ok: false,
  message:
    error instanceof SyncRequestError && error.kind === 'signed_out'
      ? 'Sign in first: sync runs only while signed in.'
      : error instanceof Error
        ? error.message
        : String(error),
});

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
    return failure(error);
  } finally {
    await adapter.destroy();
  }
};

/**
 * One full sync of this phone's library against the API configured in
 * EXPO_PUBLIC_API_URL, as the signed-in account: push, bootstrap, pull, then
 * the games the pull named. It runs on the real database, the one signing
 * out destroys, so the account's rows never land in a second file. The list
 * it pushes is created and deleted in the same push, so no device shows it.
 */
const runAgainstApi = async (adapter: StorageAdapter): Promise<Result> => {
  // Checked before writing, so a signed-out phone keeps no test ops queued.
  if ((await session.current()) === null) return failure(new SyncRequestError('signed_out'));
  try {
    const nowMs = syncEnv.now();
    const list = createList({
      id: newId(syncEnv.randomBytes, nowMs),
      name: 'Sync check',
      createdAt: new Date(nowMs).toISOString(),
    });
    await commitLocalCreate(adapter, syncEnv, { entity: 'list', next: list });
    await commitLocalDelete(adapter, syncEnv, { entity: 'list', entityId: list.id });

    const started = Date.now();
    const result = await runSync({ adapter, env: syncEnv, api: syncApi, catalog: catalogApi });
    const state = await getSyncState(adapter);
    const lines = [
      `pushed ${String(result.pushed)}, rejected ${String(result.rejected)}, pulled ${String(result.pulled)} ops`,
      `outbox ${String(await countPendingOps(adapter))} left`,
      `log position ${String(state.lastPulledSeq)}`,
      `games cached ${String(result.games)}`,
      `${String(Date.now() - started)} ms`,
    ];
    return state.bootstrapped ? { ok: true, lines } : { ok: false, message: lines.join('\n') };
  } catch (error) {
    return failure(error);
  }
};

const SyncCheckScreen = () => {
  const { colors } = useTheme();
  const [result, setResult] = useState<Result | null>(null);
  const [synced, setSynced] = useState<Result | null>(null);
  const adapter = useDatabase();

  useEffect(() => {
    void run()
      .then(setResult)
      .then(() => runAgainstApi(adapter))
      .then(setSynced);
  }, [adapter]);

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
      {synced === null ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <>
          <Text style={[type.title, { color: synced.ok ? colors.text : colors.danger }]}>
            {synced.ok ? 'Synced with the API' : 'The sync with the API failed'}
          </Text>
          {(synced.ok ? synced.lines : [synced.message]).map((line) => (
            <Text key={line} style={[type.subhead, { color: colors.muted }]}>
              {line}
            </Text>
          ))}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', padding: space.xl, gap: space.sm },
});

export default SyncCheckScreen;
