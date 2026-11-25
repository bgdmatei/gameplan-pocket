import { emailSchema } from '@gameplan/contracts';
import { getSyncState } from '@gameplan/storage';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, InteractionManager, Platform, StyleSheet, Text } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase, useEraseDatabase } from '@/data/database';
import { appVersion, syncEnv } from '@/data/env';
import { authApi, session } from '@/features/account/auth-client';
import { CodeForm } from '@/features/account/code-form';
import { EmailForm } from '@/features/account/email-form';
import { checkSession } from '@/features/account/session';
import type { Session } from '@/features/account/session';
import { SignedInCard } from '@/features/account/signed-in-card';
import { signIn, signInAfterErase } from '@/features/account/sign-in';
import type { SignInResult } from '@/features/account/sign-in';
import { eraseWarning, libraryCounts, signOut } from '@/features/account/sign-out';
import { requestSync } from '@/features/sync/sync-requests';
import { ThemeButton } from '@/ui/components/theme-button';
import { useToast } from '@/ui/components/toast';
import { displayMaxScale, space, type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

type Step =
  | { kind: 'loading' }
  | { kind: 'email' }
  | { kind: 'code'; email: string }
  | { kind: 'signed_in'; session: Session };

const OFFLINE = 'You’re offline. Try again when you’re connected.';

const NOT_SIGNED_IN = {
  invalid_code: 'That code didn’t work. Check it, or send a new one.',
  offline: OFFLINE,
  failed: 'Signing in didn’t work. Try again.',
};

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
  // Set when an erase to sign in as another account couldn't finish the sign-in.
  const resumed = useLocalSearchParams<{ email?: string; failed?: string }>();
  const [step, setStep] = useState<Step>({ kind: 'loading' });
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [owned, setOwned] = useState(false);
  // Something to lose: an empty library offers no erase button.
  const [hasData, setHasData] = useState(false);

  // Signed in: ask the server who we are, which also refreshes the token if
  // needed. Offline is normal and keeps the session (never signed out for it).
  const check = useCallback(
    async (current: Session) => {
      const status = await checkSession(session, authApi);
      if (status === 'ended') {
        setStep({ kind: 'email' });
        toast.show('Your sign-in ended. Sign in again to keep this library.');
        return;
      }
      // Reachability shows in the sync line (#23), live, not as of this check.
      setStep({ kind: 'signed_in', session: current });
    },
    [toast],
  );

  useEffect(() => {
    void (async () => {
      setOwned((await getSyncState(adapter)).ownerUserId !== null);
      const { games, notes } = await libraryCounts(adapter);
      setHasData(games + notes > 0);
      const current = await session.current();
      if (current === null && resumed.email !== undefined) {
        setEmail(resumed.email);
        setStep({ kind: 'code', email: resumed.email });
        const reason = resumed.failed;
        if (reason !== undefined && Object.hasOwn(NOT_SIGNED_IN, reason)) {
          toast.show(NOT_SIGNED_IN[reason as keyof typeof NOT_SIGNED_IN]);
        }
        return;
      }
      if (current === null) {
        setStep({ kind: 'email' });
        return;
      }
      setStep({ kind: 'signed_in', session: current });
      await check(current);
    })();
  }, [adapter, check, resumed.email, resumed.failed, toast]);

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
    setStep({ kind: 'code', email: parsed.data });
  };

  /**
   * Every way of erasing ends here, after the one warning (decision 6), which
   * counts what would go. Erasing reopens the database, so the app starts
   * again on the Library.
   */
  const confirmErase = async (
    title: string,
    why: string | null,
    action: string,
    run: () => Promise<void> = () => signOut({ session, api: authApi, erase }),
  ): Promise<void> => {
    const warning = eraseWarning(await libraryCounts(adapter));
    Alert.alert(title, why === null ? warning : `${why} ${warning}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: action,
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy(true);
            try {
              await run();
            } catch {
              toast.show('Erasing didn’t finish. Try again.');
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  };

  const signInDeps = {
    api: authApi,
    session,
    randomBytes: syncEnv.randomBytes,
    platform: Platform.OS === 'android' ? ('android' as const) : ('ios' as const),
    appVersion,
    requestSync,
  };

  const submitCode = async (address: string, entered: string): Promise<void> => {
    setBusy(true);
    const result = await signIn({ ...signInDeps, adapter }, { email: address, code: entered });
    setBusy(false);

    switch (result.kind) {
      case 'signed_in':
        // Back to the Library header this screen was opened from.
        router.back();
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
        await confirmErase(
          'This library belongs to another account',
          `Sign in with the account it belongs to, or erase it to sign in as ${address}.`,
          'Erase library',
          async () => {
            const credentials = { email: address, code: entered };
            const after = await signInAfterErase({ ...signInDeps, erase }, credentials).catch(
              (): SignInResult => ({ kind: 'failed' }),
            );
            if (after.kind === 'signed_in') return;
            const failed: keyof typeof NOT_SIGNED_IN =
              after.kind === 'invalid_code' || after.kind === 'offline' ? after.kind : 'failed';
            // The app restarted on the Library with the new database; wait for its navigator.
            InteractionManager.runAfterInteractions(() => {
              router.push({ pathname: '/account', params: { email: address, failed } });
            });
          },
        );
    }
  };

  return (
    <>
      {/* The theme lives here, the screen for this phone's own settings. */}
      <Stack.Screen options={{ headerRight: () => <ThemeButton /> }} />
      <KeyboardAwareScrollView
        contentContainerStyle={[styles.page, { paddingBottom: space.xl + insets.bottom }]}
        bottomOffset={space.lg}
        disableScrollOnKeyboardHide
        keyboardShouldPersistTaps="handled"
      >
        {/* The title in the serif, as on Library; the native header keeps the back and theme buttons. */}
        <Text
          maxFontSizeMultiplier={displayMaxScale}
          style={[type.display, { color: colors.text }]}
          accessibilityRole="header"
        >
          Account
        </Text>
        {step.kind === 'email' && (
          <EmailForm
            email={email}
            onChangeEmail={setEmail}
            busy={busy}
            owned={owned}
            canErase={owned && hasData}
            onSend={() => void sendCode()}
            onErase={() => void confirmErase('Erase this phone’s library?', null, 'Erase library')}
          />
        )}

        {step.kind === 'code' && (
          <CodeForm
            email={step.email}
            code={code}
            onChangeCode={setCode}
            busy={busy}
            onSubmit={(entered) => void submitCode(step.email, entered)}
            onDifferentEmail={() => setStep({ kind: 'email' })}
            onResend={() => void sendCode()}
          />
        )}

        {step.kind === 'signed_in' && (
          <SignedInCard
            session={step.session}
            busy={busy}
            onSignOut={() => void confirmErase('Sign out?', null, 'Erase and sign out')}
          />
        )}
      </KeyboardAwareScrollView>
    </>
  );
};

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
});

export default AccountScreen;
