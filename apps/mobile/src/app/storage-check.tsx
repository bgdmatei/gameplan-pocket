import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { migrate } from '@gameplan/db-schema';
import { createOpSqliteAdapter } from '@gameplan/storage/op-sqlite';
import { runAdapterCases } from '@gameplan/storage/testing';

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
        <Text style={styles.failed}>Could not run the check</Text>
        <Text style={styles.detail}>{failure}</Text>
      </View>
    );
  }

  if (check === null) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator />
        <Text style={styles.detail}>Running the storage contract…</Text>
      </View>
    );
  }

  const passed = check.results.filter((result) => result.passed).length;
  const allPassed = passed === check.results.length;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.title}>Storage contract on op-sqlite</Text>
      <Text style={allPassed ? styles.summaryOk : styles.summaryBad}>
        {passed} of {check.results.length} passed · schema v{check.migratedTo} · {check.elapsedMs}{' '}
        ms
      </Text>

      {check.results.map((result) => (
        <View key={result.name} style={styles.row}>
          <Text style={result.passed ? styles.pass : styles.fail}>
            {result.passed ? '✓' : '✗'} {result.name}
          </Text>
          {result.error === undefined ? null : <Text style={styles.detail}>{result.error}</Text>}
        </View>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  page: { padding: 20, gap: 8 },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  title: { fontSize: 20, fontWeight: '600' },
  summaryOk: { fontSize: 15, color: '#1a7f37', marginBottom: 8 },
  summaryBad: { fontSize: 15, color: '#c0392b', marginBottom: 8 },
  row: { gap: 2 },
  pass: { fontSize: 13, color: '#1a7f37' },
  fail: { fontSize: 13, color: '#c0392b', fontWeight: '600' },
  failed: { fontSize: 17, fontWeight: '600', color: '#c0392b' },
  detail: { fontSize: 12, opacity: 0.7 },
});

export default StorageCheckScreen;
