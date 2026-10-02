import { useColorScheme } from 'react-native';
import { themes } from './theme';
import type { Theme } from './theme';

/**
 * The theme for the phone's current appearance. "Arcade Night" is dark-first,
 * so dark is also the answer when the system reports no preference.
 */
export const useTheme = (): Theme => (useColorScheme() === 'light' ? themes.light : themes.dark);
