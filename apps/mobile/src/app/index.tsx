import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { space, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

/** Temporary: the library tab replaces this screen, and the checks move to the debug menu (T9). */
const HomeScreen = () => {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <Text style={[type.largeTitle, { color: colors.text }]}>Library</Text>
      <Link href="/storage-check" style={[type.body, styles.link, { color: colors.accent }]}>
        Run the storage contract
      </Link>
      <Link href="/sync-check" style={[type.body, styles.link, { color: colors.accent }]}>
        Commit one op on this phone
      </Link>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md },
  link: { paddingVertical: space.sm },
});

export default HomeScreen;
