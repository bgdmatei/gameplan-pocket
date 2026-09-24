import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { space, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

/** Placeholder until game detail lands (T11). */
const GameScreen = () => {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <SafeAreaView style={styles.page}>
      <Text style={[type.title, { color: colors.text }]}>Game {id}</Text>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({ page: { flex: 1, padding: space.lg } });

export default GameScreen;
