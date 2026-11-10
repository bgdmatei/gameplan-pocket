import type { ThemePreference } from '@gameplan/storage';
import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';
import { useThemePreference } from '../theme-preference';
import { HeaderIconButton } from './header-button';

const LOOK: Record<
  ThemePreference,
  { icon: ComponentProps<typeof Ionicons>['name']; name: string }
> = {
  auto: { icon: 'contrast-outline', name: 'Auto' },
  light: { icon: 'sunny-outline', name: 'Light' },
  dark: { icon: 'moon-outline', name: 'Dark' },
};

/** Cycles the app's theme, Auto → Light → Dark, from a header. Says which one it is now. */
export const ThemeButton = () => {
  const { preference, cycle } = useThemePreference();
  const { icon, name } = LOOK[preference];
  return <HeaderIconButton icon={icon} label={`Theme: ${name}`} onPress={() => void cycle()} />;
};
