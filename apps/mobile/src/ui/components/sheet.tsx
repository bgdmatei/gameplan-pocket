import type { ReactNode } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space, type } from '../theme';
import { useTheme } from '../use-theme';
import { HeaderButton } from './header-button';

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** A second header action, such as Clear, shown opposite Done. */
  action?: { label: string; onPress: () => void };
  children: ReactNode;
};

/**
 * A native page sheet (iOS) that slides up over the screen: Done or a swipe
 * down closes it. For choices too many to fit in a row of chips.
 */
export const Sheet = ({ visible, title, onClose, action, children }: Props) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.sheet, { backgroundColor: colors.background }]}>
        <View style={[styles.head, { borderBottomColor: colors.line }]}>
          <View style={styles.side}>
            {action === undefined ? null : (
              <HeaderButton label={action.label} onPress={action.onPress} />
            )}
          </View>
          <Text style={[type.headline, { color: colors.text }]} accessibilityRole="header">
            {title}
          </Text>
          <View style={[styles.side, styles.end]}>
            <HeaderButton label="Done" emphasis onPress={onClose} />
          </View>
        </View>
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: space.xl + insets.bottom }]}
        >
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  side: { flex: 1, alignItems: 'flex-start' },
  end: { alignItems: 'flex-end' },
  body: { padding: space.lg, gap: space.lg },
});
