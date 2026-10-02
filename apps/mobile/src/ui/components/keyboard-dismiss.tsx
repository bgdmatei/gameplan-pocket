import { useRef } from 'react';
import type { ReactNode } from 'react';
import { Keyboard, StyleSheet, TextInput, View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';

/** Movement past this is a drag or a scroll, not a tap. */
const TAP_SLOP = 10;

type Touch = {
  x: number;
  y: number;
  input: ReturnType<typeof TextInput.State.currentlyFocusedInput>;
};

/**
 * Hides the keyboard when the user taps anywhere outside the field they are
 * typing in, app-wide. It only listens: the tap still reaches whatever was
 * tapped, so a chip tapped mid-edit both works and closes the keyboard.
 *
 * It stays open for a tap inside the focused field (moving the cursor) and
 * for a tap into another field (focus moved, so closing would only flicker).
 */
export const KeyboardDismiss = ({ children }: { children: ReactNode }) => {
  const touch = useRef<Touch | null>(null);

  const start = (event: GestureResponderEvent) => {
    const input = TextInput.State.currentlyFocusedInput();
    touch.current =
      input === null ? null : { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY, input };
  };

  const end = (event: GestureResponderEvent) => {
    const began = touch.current;
    touch.current = null;
    if (began === null) return;
    const { pageX, pageY } = event.nativeEvent;
    if (Math.abs(pageX - began.x) > TAP_SLOP || Math.abs(pageY - began.y) > TAP_SLOP) return;

    // After the tap has been handled, so a newly focused field is known.
    setTimeout(() => {
      const input = began.input;
      if (input === null || TextInput.State.currentlyFocusedInput() !== input) return;
      input.measureInWindow((x, y, width, height) => {
        const inside = pageX >= x && pageX <= x + width && pageY >= y && pageY <= y + height;
        if (!inside) Keyboard.dismiss();
      });
    }, 0);
  };

  return (
    <View style={styles.fill} onTouchStart={start} onTouchEnd={end}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({ fill: { flex: 1 } });
