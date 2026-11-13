import { StyleSheet, Text, View } from 'react-native';
import { SyncStatusLine } from '@/features/sync/sync-status';
import { PrimaryButton } from '@/ui/components/primary-button';
import { radius, space, type } from '@/ui/theme';
import { useFormStyles } from './form-styles';
import type { Session } from './session';

type SignedInCardProps = {
  session: Session;
  busy: boolean;
  onSignOut: () => void;
};

/**
 * Signed in: who, then sync, each in its own card, then the way out
 * (SPEC-auth-identity.md §Mobile; layout chosen by the owner, #33). The
 * device id moved to Debug: it means nothing to a player.
 */
export const SignedInCard = ({ session, busy, onSignOut }: SignedInCardProps) => {
  const { colors, muted } = useFormStyles();
  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.line }];
  const heading = [type.label, { color: colors.muted }];
  return (
    <>
      <View style={styles.section}>
        <Text style={heading} accessibilityRole="header">
          ACCOUNT
        </Text>
        <View style={card}>
          <Text style={muted}>Signed in as</Text>
          <Text style={[type.headline, { color: colors.text }]}>{session.user.email}</Text>
        </View>
      </View>
      <View style={styles.section}>
        <Text style={heading} accessibilityRole="header">
          SYNC
        </Text>
        <View style={card}>
          <SyncStatusLine />
          <Text style={muted}>This phone syncs with your account.</Text>
        </View>
      </View>
      <PrimaryButton label="Sign out" tone="destructive" busy={busy} onPress={onSignOut} />
    </>
  );
};

const styles = StyleSheet.create({
  section: { gap: space.sm },
  // A soft card, like the sections on Game detail.
  card: {
    padding: space.lg,
    gap: space.xs,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
