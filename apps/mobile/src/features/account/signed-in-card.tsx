import { StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '@/ui/components/pressable-scale';
import { radius, space, tabularNumbers, type } from '@/ui/theme';
import { outlined, useFormStyles } from './form-styles';
import type { Session } from './session';

type SignedInCardProps = {
  session: Session;
  /** Null while the server is being asked. */
  online: boolean | null;
  busy: boolean;
  onSignOut: () => void;
};

/** Signed in: who, which device, and the way out (SPEC-auth-identity.md §Mobile). */
export const SignedInCard = ({ session, online, busy, onSignOut }: SignedInCardProps) => {
  const { colors, muted } = useFormStyles();
  return (
    <>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <Text style={[type.label, { color: colors.muted }]}>SIGNED IN AS</Text>
        <Text style={[type.headline, { color: colors.text }]}>{session.user.email}</Text>
        <Text style={muted}>This phone is registered for sync.</Text>
        <Text style={[muted, tabularNumbers]} accessibilityLabel={`Device ID ${session.device.id}`}>
          Device ID {session.device.id.slice(0, 8)}
        </Text>
        {online === false && <Text style={muted}>Offline. Will reconnect when online.</Text>}
      </View>
      <PressableScale
        accessibilityRole="button"
        accessibilityState={{ busy }}
        disabled={busy}
        onPress={onSignOut}
        style={[outlined.button, { borderColor: colors.line }]}
      >
        <Text style={[type.headline, { color: colors.danger }]}>Sign out</Text>
      </PressableScale>
    </>
  );
};

const styles = StyleSheet.create({
  // A soft card, like the sections on Game detail.
  card: {
    padding: space.lg,
    gap: space.xs,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
