import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { placeholder } from '@gameplan/test-utils';

const HomeScreen = () => (
  <View style={styles.container}>
    <Text style={styles.title}>gameplan-pocket</Text>
    <Text style={styles.subtitle}>{placeholder()}</Text>
    <Link href="/storage-check" style={styles.link}>
      Run the storage contract
    </Link>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  link: {
    fontSize: 15,
    color: '#0a7ea4',
    paddingVertical: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.6,
  },
});

export default HomeScreen;
