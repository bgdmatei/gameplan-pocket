import { StyleSheet, Text } from 'react-native';
import { space, type } from '../theme';
import { useTheme } from '../use-theme';
import { PressableScale } from './pressable-scale';

type Props = { label: string; onPress: () => void; emphasis?: boolean };

/** A text button in a native header: Cancel, Done. */
export const HeaderButton = ({ label, onPress, emphasis = false }: Props) => {
  const { colors } = useTheme();

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={space.sm}
      style={styles.button}
    >
      <Text style={[emphasis ? type.headline : type.body, { color: colors.accent }]}>{label}</Text>
    </PressableScale>
  );
};

const styles = StyleSheet.create({ button: { paddingHorizontal: space.xs } });
