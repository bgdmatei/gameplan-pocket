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

/** An outlined, full-width pill for the screen's destructive actions, beside the filled one. */
export const outlined = StyleSheet.create({
  button: {
    minHeight: minTouchTarget + 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
  },
});

// A pill, like the search field and the note's location.
const styles = StyleSheet.create({
  input: {
    minHeight: minTouchTarget + 4,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
  },
});
