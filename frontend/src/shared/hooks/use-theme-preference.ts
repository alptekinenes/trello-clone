import { useThemeStore } from '../lib/theme';

export const THEME_LABELS = {
  light: 'Açık',
  dark: 'Koyu',
  system: 'Sistem',
} as const;

export function useThemePreference() {
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);
  return { preference, setPreference };
}
