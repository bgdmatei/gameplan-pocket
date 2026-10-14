import { emailSchema } from '@gameplan/contracts';
import { getSyncState } from '@gameplan/storage';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase, useEraseDatabase } from '@/data/database';
import { appVersion, syncEnv } from '@/data/env';
import { authApi, session } from '@/features/account/account';
import type { Session } from '@/features/account/session';
import { signIn } from '@/features/account/sign-in';
import { signOut } from '@/features/account/sign-out';
import { PrimaryButton } from '@/ui/components/primary-button';
import { PressableScale } from '@/ui/components/pressable-scale';
import { useToast } from '@/ui/components/toast';
import { minTouchTarget, radius, space, tabularNumbers, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

type Step =
  | { kind: 'loading' }
  | { kind: 'email' }
  | { kind: 'code'; email: string }
  | { kind: 'signed_in'; session: Session; online: boolean | null };

const OFFLINE = 'You’re offline. Try again when you’re connected.';

/**
 * Signing in is optional: the app works fully signed out, and signing in only
 * prepares sync (SPEC-auth-identity.md). Email, then a code; no passwords.
 * Nothing typed here is logged or shown in an error (CLAUDE.md §Privacy).
 */
const AccountScreen = () => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const adapter = useDatabase();
  const erase = useEraseDatabase();
  const toast = useToast();
  const [view, setView] = useState<Step>({ kind: 'loading' });
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [owned, setOwned] = useState(false);

  // Signed in: ask the server who we are, which also refreshes the token if
  // needed. Offline is normal and keeps the session (never signed out for it).
  const check = useCallback(
    async (current: Session) => {
      const token = await session.accessToken();
      if (token.kind === 'ended' || token.kind === 'signed_out') {
        setView({ kind: 'email' });
        toast.show('Your sign-in ended. Sign in again to keep this library.');
        return;
      }
      const me = token.kind === 'ok' ? await authApi.me(token.token) : null;
      setView({ kind: 'signed_in', session: current, online: me?.kind === 'ok' });
    },
    [toast],
  );

  useEffect(() => {
    void (async () => {
      setOwned((await getSyncState(adapter)).ownerUserId !== null);
      const current = await session.current();
      if (current === null) {
        setView({ kind: 'email' });
        return;
      }
      setView({ kind: 'signed_in', session: current, online: null });
      await check(current);
    })();
  }, [adapter, check]);

  const sendCode = async (): Promise<void> => {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      toast.show('That doesn’t look like an email address.');
      return;
    }
    setBusy(true);
    const result = await authApi.requestCode(parsed.data);
    setBusy(false);
    if (result.kind === 'offline') {
      toast.show(OFFLINE);
      return;
    }
    // The server answers the same whether or not a code went out (attack 9).
    setCode('');
    setView({ kind: 'code', email: parsed.data });
  };

  // The spec's warning, plainly: until sync, signing out loses the library.
  const confirmSignOut = (): void => {
    Alert.alert(
      'Sign out?',
      'This erases your library and notes from this phone. Until sync arrives, they are not stored anywhere else.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Erase and sign out',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                await signOut({ session, api: authApi, erase });
                setOwned(false);
                setEmail('');
                setView({ kind: 'email' });
              } catch {
                toast.show('Signing out didn’t finish. Try again.');
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  };

  const eraseLibrary = async (): Promise<void> => {
    await session.end();
    await erase();
    setOwned(false);
    toast.show('This phone’s library was erased. Tap Sign in to continue.');
  };

  const submitCode = async (address: string): Promise<void> => {
    setBusy(true);
    const result = await signIn(
      {
        adapter,
        api: authApi,
        session,
        randomBytes: syncEnv.randomBytes,
        platform: Platform.OS === 'android' ? 'android' : 'ios',
        appVersion,
      },
      { email: address, code },
    );
    setBusy(false);

    switch (result.kind) {
      case 'signed_in':
        setOwned(true);
        setView({ kind: 'signed_in', session: result.session, online: true });
        return;
      case 'invalid_code':
        toast.show('That code didn’t work. Check it, or send a new one.');
        return;
      case 'offline':
        toast.show(OFFLINE);
        return;
      case 'failed':
        toast.show('Signing in didn’t work. Try again.');
        return;
      case 'library_belongs_to_other':
        Alert.alert(
          'This library belongs to another account',
          'Sign in with the account it belongs to, or erase it from this phone first. ' +
            'Until sync arrives, an erased library isn’t stored anywhere else.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Erase library', style: 'destructive', onPress: () => void eraseLibrary() },
          ],
        );
    }
  };

  const field = [
    styles.input,
    type.body,
    { color: colors.text, borderColor: colors.line, backgroundColor: colors.surface },
  ];
  const muted = [type.callout, { color: colors.muted }];

  return (
    <ScrollView
      contentContainerStyle={[styles.page, { paddingBottom: space.xl + insets.bottom }]}
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
    >
      {view.kind === 'email' && (
        <>
          <Text style={muted}>
            {owned
              ? 'Sign in with the account this library belongs to, to keep it on this phone.'
              : 'Sign in to get ready for sync. The app works the same without an account.'}
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.muted}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="send"
            onSubmitEditing={() => void sendCode()}
            accessibilityLabel="Email"
            style={field}
          />
          <PrimaryButton label="Send code" busy={busy} onPress={() => void sendCode()} />
        </>
      )}

      {view.kind === 'code' && (
        <>
          <Text style={muted}>
            If {view.email} can sign in, a 6-digit code is on its way. It works for 10 minutes.
          </Text>
          <TextInput
            value={code}
            onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
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
          <PrimaryButton
            label="Sign in"
            busy={busy}
            disabled={code.length !== 6}
            onPress={() => void submitCode(view.email)}
          />
          <View style={styles.links}>
            <PressableScale accessibilityRole="button" onPress={() => setView({ kind: 'email' })}>
              <Text style={[type.callout, { color: colors.accent }]}>Use a different email</Text>
            </PressableScale>
            <PressableScale accessibilityRole="button" onPress={() => void sendCode()}>
              <Text style={[type.callout, { color: colors.accent }]}>Send a new code</Text>
            </PressableScale>
          </View>
        </>
      )}

      {view.kind === 'signed_in' && (
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={muted}>Signed in as</Text>
          <Text style={[type.headline, { color: colors.text }]}>{view.session.user.email}</Text>
          <Text style={muted}>This phone is registered for sync.</Text>
          {view.online === false && <Text style={muted}>Offline. Will reconnect when online.</Text>}
        </View>
      )}

      {view.kind === 'signed_in' && (
        <PressableScale
          accessibilityRole="button"
          accessibilityState={{ busy }}
          disabled={busy}
          onPress={confirmSignOut}
          style={[styles.signOut, { borderColor: colors.line }]}
        >
          <Text style={[type.headline, { color: colors.danger }]}>Sign out</Text>
        </PressableScale>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
  input: {
    minHeight: minTouchTarget,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderWidth: 1,
    borderRadius: radius.small,
  },
  code: { letterSpacing: 8, textAlign: 'center' },
  links: { flexDirection: 'row', justifyContent: 'space-between' },
  card: { padding: space.lg, gap: space.xs, borderRadius: radius.card },
  signOut: {
    minHeight: minTouchTarget + 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.small,
  },
});

export default AccountScreen;
