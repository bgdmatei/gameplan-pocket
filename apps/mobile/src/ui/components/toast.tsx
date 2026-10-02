import { DomainValidationError } from '@gameplan/domain';
import { useSegments } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, space, type } from '../theme';
import { useTheme } from '../use-theme';

type Toast = { lines: readonly string[]; tone: 'info' | 'problem' };

type ToastApi = {
  show: (message: string) => void;
  /**
   * Lists every reason a write was rejected, and rethrows anything else.
   * The reasons come from domain codes and schema wording, never from the
   * value typed, so note text cannot leak into a toast (CLAUDE.md §Privacy).
   */
  showRejected: (error: unknown) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const VISIBLE_MS = 4_000;
/** Clears the tab bar on a tab screen; pushed screens and modals have none. */
const ABOVE_TABS = 64;

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const onTabs = useSegments()[0] === '(tabs)';
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const present = useCallback((next: Toast) => {
    setToast(next);
    // VoiceOver users hear it even though focus stays where it was.
    AccessibilityInfo.announceForAccessibility(next.lines.join(' '));
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), VISIBLE_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const api: ToastApi = {
    show: (message) => present({ lines: [message], tone: 'info' }),
    showRejected: (error) => {
      if (!(error instanceof DomainValidationError)) throw error;
      present({ lines: error.messages, tone: 'problem' });
    },
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast === null ? null : (
        <View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[
            styles.toast,
            {
              bottom: insets.bottom + (onTabs ? ABOVE_TABS : space.lg),
              backgroundColor: colors.text,
              borderLeftColor: toast.tone === 'problem' ? colors.danger : colors.accentFill,
            },
          ]}
        >
          {toast.lines.map((line) => (
            <Text key={line} style={[type.callout, { color: colors.background }]}>
              {line}
            </Text>
          ))}
        </View>
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
  toast: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    padding: space.md,
    gap: space.xs,
    borderRadius: radius.card,
    borderLeftWidth: 4,
  },
});
