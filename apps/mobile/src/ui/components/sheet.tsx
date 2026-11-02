import type { ReactElement, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space, type } from '../theme';
import { useTheme } from '../use-theme';
import { Frosted } from './frosted';
import { HeaderButton } from './header-button';

/** Room a list must leave at its ends: under the frosted head, and above the home indicator. */
export type SheetInset = { top: number; bottom: number };

type Body =
  /** A few things, laid out in a scrolling column. */
  | { children: ReactNode; list?: never; placeholder?: never }
  /**
   * A long list that scrolls itself (virtualised), mounted only once the
   * sheet is up: hundreds of rows built before the slide made See all feel
   * stuck. `placeholder` shows until then.
   */
  | { list: (inset: SheetInset) => ReactElement; placeholder: ReactNode; children?: never };

type Props = Body & {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** A second header action, such as Clear, shown opposite Done. */
  action?: { label: string; onPress: () => void };
};

/**
 * A native page sheet (iOS) that slides up over the screen: Done or a swipe
 * down closes it. For choices too many to fit in a row of chips. iOS draws
 * its large rounded top; the head is frosted and the content scrolls under
 * it, like Search's bar.
 */
export const Sheet = ({ visible, title, onClose, action, children, list, placeholder }: Props) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [headHeight, setHeadHeight] = useState(0);
  // Up on screen: the slide has finished.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!visible) setShown(false);
  }, [visible]);

  const inset: SheetInset = { top: headHeight, bottom: space.xl + insets.bottom };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onShow={() => setShown(true)}
    >
      <View style={[styles.sheet, { backgroundColor: colors.background }]}>
        {list === undefined ? (
          <ScrollView
            contentContainerStyle={[
              styles.body,
              { paddingTop: inset.top + space.lg, paddingBottom: inset.bottom },
            ]}
            scrollIndicatorInsets={{ top: inset.top }}
          >
            {children}
          </ScrollView>
        ) : shown ? (
          list(inset)
        ) : (
          <View style={{ paddingTop: inset.top }}>{placeholder}</View>
        )}
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
