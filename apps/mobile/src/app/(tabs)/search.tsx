import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { space, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

/** Placeholder until search lands (T10). */
const SearchScreen = () => {
  const { colors } = useTheme();

  return (
    <SafeAreaView edges={['top']} style={styles.page}>
      <Text style={[type.largeTitle, { color: colors.text }]} accessibilityRole="header">
        Search
      </Text>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: space.lg, gap: space.md },
});

export default SearchScreen;
