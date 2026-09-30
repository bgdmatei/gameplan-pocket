import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LibraryGrid } from '@/ui/components/library-grid';
import { space, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

/** Games taken out of the library. Archived, never deleted: opening one offers to restore it. */
const ArchiveScreen = () => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <LibraryGrid
      filters={{ archived: true, sort: 'recent' }}
      bottomInset={insets.bottom}
      empty={
        <View style={styles.empty}>
          <Text style={[type.body, { color: colors.muted }]}>
            Nothing archived. Games you archive keep their rating and notes here.
          </Text>
        </View>
      }
    />
  );
};

const styles = StyleSheet.create({ empty: { padding: space.lg } });

export default ArchiveScreen;
