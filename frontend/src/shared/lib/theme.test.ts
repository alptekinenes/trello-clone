import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useThemePreference } from '../hooks/use-theme-preference';
import {
  applyTheme,
  initTheme,
  readStoredTheme,
  THEME_STORAGE_KEY,
  useThemeStore,
} from './theme';

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
  useThemeStore.setState({ preference: 'system' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('readStoredTheme', () => {
  it('defaults to system when nothing is stored', () => {
    expect(readStoredTheme()).toBe('system');
  });

  it('returns a stored valid preference', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(readStoredTheme()).toBe('dark');
  });

  it('falls back to system for a corrupt value', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, '{"oops"');
    expect(readStoredTheme()).toBe('system');
  });

  it('falls back to system when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(readStoredTheme()).toBe('system');
  });
});

describe('applyTheme', () => {
  it('sets data-theme for light and dark and removes it for system', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    applyTheme('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});

describe('useThemePreference', () => {
  it('starts as system', () => {
    const { result } = renderHook(() => useThemePreference());
    expect(result.current.preference).toBe('system');
  });

  it('persists the choice and applies it to the document', () => {
    const { result } = renderHook(() => useThemePreference());

    act(() => result.current.setPreference('dark'));

    expect(result.current.preference).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('still switches when storage cannot be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const { result } = renderHook(() => useThemePreference());

    act(() => result.current.setPreference('light'));

    expect(result.current.preference).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('only ever writes the theme key', () => {
    const { result } = renderHook(() => useThemePreference());
    act(() => result.current.setPreference('light'));
    expect(window.localStorage.length).toBe(1);
  });
});

describe('initTheme', () => {
  it('applies the current preference to the document', () => {
    useThemeStore.setState({ preference: 'light' });
    initTheme();
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
