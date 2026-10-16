import { StyleSheet } from 'react-native';
import { minTouchTarget, radius, space, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

/** The Account screen's text field and secondary text, in the current theme. */
export const useFormStyles = () => {
  const { colors } = useTheme();
  return {
    colors,
    field: [
      styles.input,
      type.body,
      { color: colors.text, borderColor: colors.line, backgroundColor: colors.surface },
    ],
    muted: [type.callout, { color: colors.muted }],
  };
};

/** An outlined, full-width button for the screen's destructive actions. */
export const outlined = StyleSheet.create({
  button: {
    minHeight: minTouchTarget + 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.small,
  },
});

const styles = StyleSheet.create({
  input: {
    minHeight: minTouchTarget,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderWidth: 1,
    borderRadius: radius.small,
  },
});
