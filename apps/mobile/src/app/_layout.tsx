import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { DatabaseProvider } from '@/data/database';
// Evaluated first thing, so its clock starts as the app's JS does (cold start, T19).
import '@/data/perf';
import { KeyboardDismiss } from '@/ui/components/keyboard-dismiss';
import { ToastProvider } from '@/ui/components/toast';
import { useApplyStoredTheme } from '@/ui/theme-preference';
import { useTheme } from '@/ui/use-theme';

/**
 * A deep link opens its screen on top of the tabs, so a game or note opened
 * cold from a link still has somewhere to go back to.
 */
export const unstable_settings = { initialRouteName: '(tabs)' };

/** Applies the player's stored theme once the database is open (and again after an erase). */
const StoredTheme = () => {
  useApplyStoredTheme();
  return null;
};

const RootLayout = () => {
  const { colors, scheme } = useTheme();

  // Debug screens are plain lists, so they get the native header and its back
  // button; the app's own screens draw their own tops.
  // Chevron only: the screen behind may be either tab, so a named back button
  // would often name the wrong one.
  const withHeader = (title: string) => ({
    headerShown: true,
    title,
    headerBackButtonDisplayMode: 'minimal' as const,
  });

  return (
    <DatabaseProvider>
      <StoredTheme />
      <ToastProvider>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <KeyboardDismiss>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.accent,
              headerTitleStyle: { color: colors.text },
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="game/[id]" options={withHeader('')} />
            <Stack.Screen name="game/[id]/notes" options={withHeader('Notes')} />
            <Stack.Screen name="note/new" options={withHeader('New note')} />
            <Stack.Screen name="note/[id]" options={withHeader('Note')} />
            <Stack.Screen name="archive" options={withHeader('Archive')} />
            <Stack.Screen name="account" options={withHeader('Account')} />
            <Stack.Screen name="debug/index" options={withHeader('Debug')} />
            <Stack.Screen name="debug/outbox" options={withHeader('Outbox')} />
            <Stack.Screen name="debug/storage-check" options={withHeader('Storage contract')} />
            <Stack.Screen name="debug/sync-check" options={withHeader('Sync check')} />
          </Stack>
        </KeyboardDismiss>
      </ToastProvider>
    </DatabaseProvider>
  );
};

export default RootLayout;
