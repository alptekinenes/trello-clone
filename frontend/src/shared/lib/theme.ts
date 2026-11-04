import { create } from 'zustand';

export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const THEME_STORAGE_KEY = 'theme';

function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.some((preference) => preference === value);
}

/** Reads the saved choice; anything unreadable or unknown means "system". */
export function readStoredTheme(): ThemePreference {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

function writeStoredTheme(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage can be blocked or full; the choice then only lasts for this session.
  }
}

/**
 * "system" leaves the attribute off so the `prefers-color-scheme` rules in tokens.css
 * keep following the OS.
 */
export function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === 'system') delete root.dataset.theme;
  else root.dataset.theme = preference;
}

interface ThemeState {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  preference: readStoredTheme(),
  setPreference: (preference) => {
    writeStoredTheme(preference);
    applyTheme(preference);
    set({ preference });
  },
}));

/** Applies the saved theme to the document. Call once before the first render. */
export function initTheme(): void {
  applyTheme(useThemeStore.getState().preference);
}
