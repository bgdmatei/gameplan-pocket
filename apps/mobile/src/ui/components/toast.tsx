import Ionicons from '@expo/vector-icons/Ionicons';
import { DomainValidationError } from '@gameplan/domain';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeOut, SlideInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Colors } from '../palette';
import { radius, space, type } from '../theme';
import { useTheme } from '../use-theme';

/** Owner, 2026-11-11: colour-coded, so the kind of message reads at a glance. */
export type ToastTone = 'info' | 'success' | 'warning' | 'problem';

/** Each tone's tinted card and icon; the text stays `text`, AA on every fill. */
const TONES: Record<
  ToastTone,
  { fill: keyof Colors; icon: keyof Colors; name: ComponentProps<typeof Ionicons>['name'] }
> = {
  info: { fill: 'surface', icon: 'accent', name: 'information-circle' },
  success: { fill: 'successFill', icon: 'success', name: 'checkmark-circle' },
  warning: { fill: 'warningFill', icon: 'warning', name: 'cloud-offline' },
  problem: { fill: 'dangerFill', icon: 'danger', name: 'alert-circle' },
};

type Toast = { id: number; lines: readonly string[]; tone: ToastTone };

type ToastApi = {
  show: (message: string, tone?: ToastTone) => void;
  /**
   * Lists every reason a write was rejected, and rethrows anything else.
   * The reasons come from domain codes and schema wording, never from the
   * value typed, so note text cannot leak into a toast (CLAUDE.md §Privacy).
   */
  showRejected: (error: unknown) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const VISIBLE_MS = 4_000;

/**
 * Drops in from the top (owner, 2026-11-11): at the bottom it sat over the
 * tab bar and was easy to miss. Slides down, fades out; with Reduce Motion,
 * Reanimated skips the movement.
 */
export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A new id only when none is showing: a toast replacing another swaps its
  // content in place, rather than sliding in over the one fading out.
  const nextId = useRef(0);
  const visible = useRef(false);

  const present = useCallback((content: Omit<Toast, 'id'>) => {
    if (!visible.current) nextId.current += 1;
    visible.current = true;
    setToast({ ...content, id: nextId.current });
    // VoiceOver users hear it even though focus stays where it was.
    AccessibilityInfo.announceForAccessibility(content.lines.join(' '));
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      visible.current = false;
      setToast(null);
    }, VISIBLE_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  // Stable, so a consumer can depend on it in an effect (SyncTriggers).
  const api = useMemo<ToastApi>(
    () => ({
      show: (message, tone = 'info') => present({ lines: [message], tone }),
      showRejected: (error) => {
        if (!(error instanceof DomainValidationError)) throw error;
        present({ lines: error.messages, tone: 'problem' });
      },
    }),
    [present],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast === null ? null : (
        <Animated.View
          key={toast.id}
          entering={SlideInUp}
          exiting={FadeOut}
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[styles.toast, { top: insets.top + space.sm }]}
        >
          <View
            style={[
              styles.card,
              { backgroundColor: colors[TONES[toast.tone].fill], borderColor: colors.line },
            ]}
          >
            <Ionicons
              name={TONES[toast.tone].name}
              size={20}
              color={colors[TONES[toast.tone].icon]}
            />
            <View style={styles.lines}>
              {toast.lines.map((line) => (
                <Text key={line} style={[type.callout, { color: colors.text }]}>
                  {line}
                </Text>
              ))}
            </View>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastApi => {
  const api = useContext(ToastContext);
  if (api === null) throw new Error('useToast is used outside ToastProvider.');
  return api;
};

const styles = StyleSheet.create({
  toast: { position: 'absolute', left: space.lg, right: space.lg },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.sheet,
    borderWidth: StyleSheet.hairlineWidth,
  },
  lines: { flex: 1, gap: space.xs },
});
