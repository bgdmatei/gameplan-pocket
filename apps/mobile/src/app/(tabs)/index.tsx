import { Link } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { space, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

/** Placeholder until the grid lands (T12). The debug link stays, in the header. */
const LibraryScreen = () => {
  const { colors } = useTheme();

  return (
    <SafeAreaView edges={['top']} style={styles.page}>
      <Text style={[type.largeTitle, { color: colors.text }]} accessibilityRole="header">
        Library
      </Text>
      <Link href="/debug" style={[type.body, styles.link, { color: colors.accent }]}>
        Debug
      </Link>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: space.lg, gap: space.md },
  link: { paddingVertical: space.sm },
});

export default LibraryScreen;
