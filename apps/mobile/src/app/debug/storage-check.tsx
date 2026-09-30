import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { migrate } from '@gameplan/db-schema';
import { createOpSqliteAdapter } from '@gameplan/storage/op-sqlite';
import { runAdapterCases } from '@gameplan/storage/testing';
import { space, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

type CaseResult = { name: string; passed: boolean; error?: string };

type Check = { results: CaseResult[]; migratedTo: number; elapsedMs: number };

/**
 * Runs the storage contract against the database the app actually ships with.
 *
 * No test runner exists on a device, so the contract cases are plain functions
 * (`@gameplan/storage/testing`) and this screen runs the same list Vitest runs
 * against node:sqlite in CI. That is what keeps the two implementations from
 * drifting apart.
 *
 * Temporary: it stands in for a real screen until `mobile-library` (module 6).
 */
const runCheck = async (): Promise<Check> => {
  const started = Date.now();

  const results = await runAdapterCases(() =>
    // A fresh database per case, thrown away afterwards.
    createOpSqliteAdapter({ name: `contract-${String(Date.now())}-${String(Math.random())}.db` }),
  );

  // Migrations are the other half: the schema has to apply on a real device,
  // where FTS5 and generated columns are the parts most likely to differ.
  const adapter = createOpSqliteAdapter({ name: `migrate-${String(Date.now())}.db` });
  const migration = await migrate(adapter);
  await adapter.destroy();

  return { results, migratedTo: migration.to, elapsedMs: Date.now() - started };
};

const StorageCheckScreen = () => {
  const { colors, status } = useTheme();
  const ok = { color: status.completed };
  const bad = { color: colors.danger };
  const detail = [type.caption, { color: colors.muted }];
  const [check, setCheck] = useState<Check | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    runCheck()
      .then(setCheck)
      .catch((error: unknown) => {
        setFailure(error instanceof Error ? error.message : String(error));
      });
  }, []);

  if (failure !== null) {
    return (
      <View style={styles.centred}>
        <Text style={[type.headline, bad]}>Could not run the check</Text>
        <Text style={detail}>{failure}</Text>
      </View>
    );
  }

  if (check === null) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator color={colors.accent} />
        <Text style={detail}>Running the storage contract…</Text>
      </View>
    );
  }

  const passed = check.results.filter((result) => result.passed).length;
  const allPassed = passed === check.results.length;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={[type.title, { color: colors.text }]}>Storage contract on op-sqlite</Text>
      <Text style={[type.callout, styles.summary, allPassed ? ok : bad]}>
        {passed} of {check.results.length} passed · schema v{check.migratedTo} · {check.elapsedMs}{' '}
        ms
      </Text>

      {check.results.map((result) => (
        <View key={result.name} style={styles.row}>
          <Text style={[type.subhead, result.passed ? ok : [bad, styles.bold]]}>
            {result.passed ? '✓' : '✗'} {result.name}
          </Text>
          {result.error === undefined ? null : <Text style={detail}>{result.error}</Text>}
        </View>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.sm },
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.xl,
  },
  summary: { marginBottom: space.sm },
  row: { gap: 2 },
  bold: { fontWeight: '600' },
});

export default StorageCheckScreen;
