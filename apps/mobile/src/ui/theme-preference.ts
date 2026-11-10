import { getSyncState, updateSyncState } from '@gameplan/storage';
import type { ThemePreference } from '@gameplan/storage';
import { useCallback, useEffect, useState } from 'react';
import { Appearance } from 'react-native';
import { useDatabase } from '@/data/database';

/**
 * The player's theme choice, kept on the phone (`sync_state.theme`, migration
 * 006) and applied as the app's native appearance: `useTheme`, alerts, the
 * keyboard and blur all follow it. 'auto' hands the choice back to the phone.
 */
const apply = (preference: ThemePreference): void =>
  Appearance.setColorScheme(preference === 'auto' ? 'unspecified' : preference);

/** Auto → Light → Dark → Auto. */
export const nextThemePreference = (preference: ThemePreference): ThemePreference =>
  preference === 'auto' ? 'light' : preference === 'light' ? 'dark' : 'auto';

/**
 * Applies the stored choice whenever the database opens, including the fresh
 * one after an erase, which falls back to 'auto'. Rendered once, near the root.
 */
export const useApplyStoredTheme = (): void => {
  const adapter = useDatabase();
  useEffect(() => {
    void getSyncState(adapter).then(({ theme }) => apply(theme));
  }, [adapter]);
};

/** The current choice and a way to move to the next one, saved before it shows. */
export const useThemePreference = (): {
  preference: ThemePreference;
  cycle: () => Promise<void>;
} => {
  const adapter = useDatabase();
  const [preference, setPreference] = useState<ThemePreference>('auto');

  useEffect(() => {
    void getSyncState(adapter).then(({ theme }) => setPreference(theme));
  }, [adapter]);

  const cycle = useCallback(async () => {
    const next = nextThemePreference(preference);
    await updateSyncState(adapter, { theme: next });
    setPreference(next);
    apply(next);
  }, [adapter, preference]);

  return { preference, cycle };
};
