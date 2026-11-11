import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { RoundButton } from '@/ui/components/pill-button';
import { type } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';
import { describeSyncStatus } from './describe-status';
import type { SyncStatusView } from './describe-status';
import { requestSync } from './sync-requests';
import { useSyncStatus } from './use-sync-status';
import { useSyncsHere } from './use-syncs-here';

/** "2 min ago" moves on while the screen stays open. */
const useNow = (everyMs: number): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
};

/** What to show, or null: signed out, or not yet read (no guess in the meantime). */
const useSyncStatusView = (): SyncStatusView | null => {
  const status = useSyncStatus();
  const now = useNow(30_000);
  const shown = useSyncsHere();
  return shown === true && status.loaded ? describeSyncStatus(status, now) : null;
};

/**
 * The cloud. While a sync runs, only its arrows turn: a still cloud outline
 * with the circular arrows drawn inside it, rotating; still under Reduce Motion.
 */
const SyncGlyph = ({ view }: { view: SyncStatusView }) => {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const turn = useSharedValue(0);
  const spin = view.spinning && !reduceMotion;

  useEffect(() => {
    if (spin) {
      turn.value = 0;
      turn.value = withRepeat(withTiming(360, { duration: 1_000, easing: Easing.linear }), -1);
    } else {
      cancelAnimation(turn);
      turn.value = 0;
    }
  }, [spin, turn]);

  const turning = useAnimatedStyle(() => ({ transform: [{ rotate: `${String(turn.value)}deg` }] }));
  const color = colors[view.tint];
  if (!view.spinning) return <MaterialCommunityIcons name={view.icon} size={22} color={color} />;
  return (
    <View style={styles.glyph}>
      <MaterialCommunityIcons name="cloud-outline" size={22} color={color} />
      <Animated.View style={[styles.arrows, turning]}>
        <MaterialCommunityIcons name="sync" size={10} color={color} />
      </Animated.View>
    </View>
  );
};

/**
 * The Library header's sync icon (owner, 2026-11-11): one cloud family tinted
 * by tone, arrows turning while syncing; a tap syncs now, in every state,
 * since it is how another device's edit arrives at once. Hidden signed out.
 */
export const SyncStatusButton = () => {
  const view = useSyncStatusView();
  if (view === null) return null;
  return (
    <RoundButton
      glyph={<SyncGlyph view={view} />}
      label={view.label}
      onPress={() => requestSync({ byPlayer: true })}
    />
  );
};

/** The Account screen's sync line, signed in only (SPEC-sync-transport.md). */
export const SyncStatusLine = () => {
  const { colors } = useTheme();
  const view = useSyncStatusView();
  if (view === null) return null;
  return <Text style={[type.subhead, { color: colors.muted }]}>{view.line}</Text>;
};

const styles = StyleSheet.create({
  glyph: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  // The cloud's body sits low in its box: the arrows sit there too.
  arrows: { position: 'absolute', top: 9 },
});
