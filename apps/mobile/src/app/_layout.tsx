import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { DatabaseProvider } from '@/data/database';
import { ToastProvider } from '@/ui/components/toast';
import { useTheme } from '@/ui/use-theme';

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
      <ToastProvider>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
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
          <Stack.Screen name="archive" options={withHeader('Archive')} />
          <Stack.Screen name="debug/index" options={withHeader('Debug')} />
          <Stack.Screen name="debug/outbox" options={withHeader('Outbox')} />
          <Stack.Screen name="debug/storage-check" options={withHeader('Storage contract')} />
          <Stack.Screen name="debug/sync-check" options={withHeader('Sync check')} />
        </Stack>
      </ToastProvider>
    </DatabaseProvider>
  );
};

export default RootLayout;
