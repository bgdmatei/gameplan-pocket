import { StyleSheet, Text, TextInput, View } from 'react-native';
import { PrimaryButton } from '@/ui/components/primary-button';
import { PressableScale } from '@/ui/components/pressable-scale';
import { tabularNumbers, type } from '@/ui/theme';
import { useFormStyles } from './form-styles';

type CodeFormProps = {
  email: string;
  code: string;
  onChangeCode: (code: string) => void;
  busy: boolean;
  onSubmit: () => void;
  onDifferentEmail: () => void;
  onResend: () => void;
};

/** The six digits sent to `email`. */
export const CodeForm = ({
  email,
  code,
  onChangeCode,
  busy,
  onSubmit,
  onDifferentEmail,
  onResend,
}: CodeFormProps) => {
  const { colors, field, muted } = useFormStyles();
  return (
    <>
      <Text style={muted}>
        If {email} can sign in, a 6-digit code is on its way. It works for 10 minutes.
      </Text>
      <TextInput
        value={code}
        onChangeText={(text) => onChangeCode(text.replace(/\D/g, '').slice(0, 6))}
        placeholder="123456"
        placeholderTextColor={colors.muted}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoFocus
        maxLength={6}
        accessibilityLabel="Code"
        style={[field, tabularNumbers, styles.code]}
      />
      <PrimaryButton label="Sign in" busy={busy} disabled={code.length !== 6} onPress={onSubmit} />
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
  code: { letterSpacing: 8, textAlign: 'center' },
  links: { flexDirection: 'row', justifyContent: 'space-between' },
});
