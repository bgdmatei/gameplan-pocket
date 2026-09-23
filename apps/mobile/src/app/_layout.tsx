import { Stack } from 'expo-router';
import { DatabaseProvider } from '@/data/database';
import { useTheme } from '@/ui/use-theme';

const RootLayout = () => {
  const { colors } = useTheme();

  return (
    <DatabaseProvider>
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
      />
    </DatabaseProvider>
  );
};

export default RootLayout;
