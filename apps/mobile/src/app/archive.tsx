import { StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from '@/ui/components/empty-state';
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
      // The title in the serif, as on Library; the native header keeps only the back button.
      header={
        <Text
          style={[type.display, styles.title, { color: colors.text }]}
          accessibilityRole="header"
        >
          Archive
        </Text>
      }
      empty={
        <EmptyState
          icon="archive-outline"
          message="Nothing archived. Games you archive keep their rating and notes here."
        />
      }
    />
  );
};

const styles = StyleSheet.create({
  // The grid already insets by md; this lines the title up with Library's.
  title: { paddingHorizontal: space.lg - space.md, paddingBottom: space.md },
});

export default ArchiveScreen;
