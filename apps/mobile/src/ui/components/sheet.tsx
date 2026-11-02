import type { ReactNode } from 'react';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space, type } from '../theme';
import { useTheme } from '../use-theme';
import { Frosted } from './frosted';
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
 * down closes it. For choices too many to fit in a row of chips. iOS draws
 * its large rounded top; the head is frosted and the list scrolls under it,
 * like Search's bar.
 */
export const Sheet = ({ visible, title, onClose, action, children }: Props) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [headHeight, setHeadHeight] = useState(0);
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.sheet, { backgroundColor: colors.background }]}>
        <ScrollView
          contentContainerStyle={[
            styles.body,
            { paddingTop: headHeight + space.lg, paddingBottom: space.xl + insets.bottom },
          ]}
          scrollIndicatorInsets={{ top: headHeight }}
        >
          {children}
        </ScrollView>
        <Frosted style={[styles.head, { borderBottomColor: colors.line }]}>
          <View
            style={styles.row}
            onLayout={(event) => setHeadHeight(event.nativeEvent.layout.height)}
          >
            <View style={styles.side}>
              {action === undefined ? null : (
                <HeaderButton label={action.label} onPress={action.onPress} />
              )}
            </View>
            <Text style={[type.displaySmall, { color: colors.text }]} accessibilityRole="header">
              {title}
            </Text>
            <View style={[styles.side, styles.end]}>
              <HeaderButton label="Done" emphasis onPress={onClose} />
            </View>
          </View>
        </Frosted>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  head: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  side: { flex: 1, alignItems: 'flex-start' },
  end: { alignItems: 'flex-end' },
  body: { paddingHorizontal: space.lg, gap: space.lg },
});
