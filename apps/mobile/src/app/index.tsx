import { StyleSheet, Text, View } from 'react-native';
import { placeholder } from '@gameplan/test-utils';

const HomeScreen = () => (
  <View style={styles.container}>
    <Text style={styles.title}>gameplan-pocket</Text>
    <Text style={styles.subtitle}>{placeholder()}</Text>
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
