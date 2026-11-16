import { Text, TextInput } from 'react-native';
import { PrimaryButton } from '@/ui/components/primary-button';
import { useFormStyles } from './form-styles';

type EmailFormProps = {
  email: string;
  onChangeEmail: (email: string) => void;
  busy: boolean;
  /** The phone holds a library that belongs to an account. */
  owned: boolean;
  /** An owned library with games or notes in it: something to erase. */
  canErase: boolean;
  onSend: () => void;
  onErase: () => void;
};

/**
 * Signed out: an email for a code. With a library that belongs to an account
 * and holds games or notes, also the way to erase it without signing in, for
 * a player who cannot.
 */
export const EmailForm = ({
  email,
  onChangeEmail,
  busy,
  owned,
  canErase,
  onSend,
  onErase,
}: EmailFormProps) => {
  const { colors, field, muted } = useFormStyles();
  return (
    <>
      <Text style={muted}>
        {owned
          ? 'Sign in with the account this library belongs to, to keep it on this phone.'
          : 'Sign in to get ready for sync. The app works the same without an account.'}
      </Text>
      <TextInput
        value={email}
        onChangeText={onChangeEmail}
        placeholder="you@example.com"
        placeholderTextColor={colors.muted}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        autoFocus
        returnKeyType="send"
        onSubmitEditing={onSend}
        accessibilityLabel="Email"
        style={field}
      />
      <PrimaryButton label="Send code" busy={busy} onPress={onSend} />
      {canErase && (
        // Dimmed, not spinning, while a code is being sent: busy is that request's.
        <PrimaryButton
          label="Erase this phone’s library"
          tone="destructive"
          disabled={busy}
          onPress={onErase}
        />
      )}
    </>
  );
};
