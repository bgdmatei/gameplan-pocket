import { useRef } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { PrimaryButton } from '@/ui/components/primary-button';
import { PressableScale } from '@/ui/components/pressable-scale';
import { displayMaxScale, minTouchTarget, space, type } from '@/ui/theme';
import { useFormStyles } from './form-styles';

type CodeFormProps = {
  email: string;
  code: string;
  onChangeCode: (code: string) => void;
  busy: boolean;
  onSubmit: (code: string) => void;
  onDifferentEmail: () => void;
  onResend: () => void;
};

const LENGTH = 6;

/**
 * The six digits sent to `email`. One transparent input lies over six
 * underlined slots, so one-time-code autofill, paste and VoiceOver ("Code")
 * see a single field. The sixth digit signs in.
 */
export const CodeForm = ({
  email,
  code,
  onChangeCode,
  busy,
  onSubmit,
  onDifferentEmail,
  onResend,
}: CodeFormProps) => {
  const { colors, muted } = useFormStyles();
  // Autofill can fire onChangeText twice before a render; one code signs in once.
  const submitted = useRef<string | null>(null);
  const change = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, LENGTH);
    onChangeCode(digits);
    if (digits.length === LENGTH && digits !== submitted.current && !busy) {
      submitted.current = digits;
      onSubmit(digits);
    }
  };
  return (
    <>
      <Text style={muted}>
        If {email} can sign in, a 6-digit code is on its way. It's valid for 10 minutes.
      </Text>
      <View style={styles.slots}>
        {Array.from({ length: LENGTH }, (_, index) => (
          <View
            key={index}
            style={[styles.slot, { borderBottomColor: colors.line }]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text
              maxFontSizeMultiplier={displayMaxScale}
              style={[type.title, styles.digit, { color: colors.text }]}
            >
              {code[index] ?? ''}
            </Text>
          </View>
        ))}
        <TextInput
          value={code}
          onChangeText={change}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          autoFocus
          caretHidden
          selection={{ start: code.length, end: code.length }}
          selectionColor="transparent"
          maxLength={LENGTH}
          accessibilityLabel="Code"
          style={styles.input}
        />
      </View>
      <PrimaryButton
        label="Sign in"
        busy={busy}
        disabled={code.length !== LENGTH}
        onPress={() => onSubmit(code)}
      />
      <View style={styles.links}>
        <PressableScale accessibilityRole="button" onPress={onDifferentEmail}>
          <Text style={[type.callout, { color: colors.accent }]}>Use a different email</Text>
        </PressableScale>
        <PressableScale accessibilityRole="button" onPress={onResend}>
          <Text style={[type.callout, { color: colors.accent }]}>Send a new code</Text>
        </PressableScale>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  slots: { flexDirection: 'row', gap: space.md, minHeight: minTouchTarget + 4 },
  slot: { flex: 1, justifyContent: 'flex-end', paddingBottom: space.xs, borderBottomWidth: 2 },
  digit: { textAlign: 'center', fontVariant: ['tabular-nums'] },
  input: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, color: 'transparent' },
  links: { flexDirection: 'row', justifyContent: 'space-between' },
});
