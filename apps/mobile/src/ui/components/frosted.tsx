import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../use-theme';

/** iOS "Reduce Transparency", kept current while the app runs. */
const useReduceTransparency = (): boolean => {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceTransparencyEnabled().then(setReduce);
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduce);
    return () => subscription.remove();
  }, []);
  return reduce;
};

type Props = { style?: StyleProp<ViewStyle>; children?: ReactNode };

/**
 * Frosted chrome: the tab bar, round header buttons, sheets. The app's only
 * `BlurView` (literals.test.ts), so blur never lands in a list cell. With
 * Reduce Transparency on it is a solid `frostedFill`; otherwise a near-opaque
 * `frostedTint` sits over the blur. The contrast test covers both, the tint over
 * white and black content. Corners clip the blur through `overflow: hidden`.
 */
export const Frosted = ({ style, children }: Props) => {
  const { colors, frosted } = useTheme();
  const reduce = useReduceTransparency();

  if (reduce) {
    return (
      <View style={[styles.clip, style, { backgroundColor: colors.frostedFill }]}>{children}</View>
    );
  }
  return (
    <BlurView tint={frosted.tint} intensity={frosted.intensity} style={[styles.clip, style]}>
      {/* The tint carries the labels over bright covers (theme.test.ts). */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.frostedTint }]} />
      {children}
    </BlurView>
  );
};

const styles = StyleSheet.create({ clip: { overflow: 'hidden' } });
