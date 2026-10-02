import { Pressable } from 'react-native';
import type { GestureResponderEvent, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { press } from '../theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle> };

/**
 * A Pressable that sinks under the finger, on the UI thread. Every tappable
 * in the app uses it except full-width list rows, which highlight instead.
 */
export const PressableScale = ({ style, onPressIn, onPressOut, disabled, ...rest }: Props) => {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const to = (value: number) => {
    if (!reduceMotion && disabled !== true) scale.value = withSpring(value, press.spring);
  };

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(event: GestureResponderEvent) => {
        to(press.scale);
        onPressIn?.(event);
      }}
      onPressOut={(event: GestureResponderEvent) => {
        to(1);
        onPressOut?.(event);
      }}
      style={[style, animated]}
    />
  );
};
