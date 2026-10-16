import { emailSchema } from '@gameplan/contracts';
import { getSyncState } from '@gameplan/storage';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase, useEraseDatabase } from '@/data/database';
import { appVersion, syncEnv } from '@/data/env';
import { authApi, session } from '@/features/account/auth-client';
import { CodeForm } from '@/features/account/code-form';
import { EmailForm } from '@/features/account/email-form';
import { checkSession } from '@/features/account/session';
import type { Session } from '@/features/account/session';
import { SignedInCard } from '@/features/account/signed-in-card';
import { signIn } from '@/features/account/sign-in';
import { ERASE_WARNING, signOut } from '@/features/account/sign-out';
import { useToast } from '@/ui/components/toast';
import { space } from '@/ui/theme';

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
  const insets = useSafeAreaInsets();
  const adapter = useDatabase();
  const erase = useEraseDatabase();
  const toast = useToast();
  const [step, setStep] = useState<Step>({ kind: 'loading' });
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [owned, setOwned] = useState(false);

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
      setStep({ kind: 'signed_in', session: current, online: status === 'online' });
    },
    [toast],
  );

  useEffect(() => {
    void (async () => {
      setOwned((await getSyncState(adapter)).ownerUserId !== null);
      const current = await session.current();
      if (current === null) {
        setStep({ kind: 'email' });
        return;
      }
      setStep({ kind: 'signed_in', session: current, online: null });
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
    setStep({ kind: 'code', email: parsed.data });
  };

  /**
   * Every way of erasing ends here, after the one warning (decision 6).
   * Erasing reopens the database, so the app starts again on the Library.
   */
  const confirmErase = (title: string, message: string, action: string): void => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: action,
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy(true);
            try {
              await signOut({ session, api: authApi, erase });
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
        confirmErase(
          'This library belongs to another account',
          `Sign in with the account it belongs to, or erase it and then sign in as ${address}. ` +
            ERASE_WARNING,
          'Erase library',
        );
    }
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.page, { paddingBottom: space.xl + insets.bottom }]}
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
    >
      {step.kind === 'email' && (
        <EmailForm
          email={email}
          onChangeEmail={setEmail}
          busy={busy}
          owned={owned}
          onSend={() => void sendCode()}
          onErase={() =>
            confirmErase('Erase this phone’s library?', ERASE_WARNING, 'Erase library')
          }
        />
      )}

      {step.kind === 'code' && (
        <CodeForm
          email={step.email}
          code={code}
          onChangeCode={setCode}
          busy={busy}
          onSubmit={() => void submitCode(step.email)}
          onDifferentEmail={() => setStep({ kind: 'email' })}
          onResend={() => void sendCode()}
        />
      )}

      {step.kind === 'signed_in' && (
        <SignedInCard
          session={step.session}
          online={step.online}
          busy={busy}
          onSignOut={() => confirmErase('Sign out?', ERASE_WARNING, 'Erase and sign out')}
        />
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg },
});

export default AccountScreen;
