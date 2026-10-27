import type { AuthResponse, UserDto } from '@trello/contracts';
import { create } from 'zustand';

/** unknown: session not checked yet (page load). */
export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous';

interface AuthState {
  status: AuthStatus;
  user: UserDto | null;
  /** Kept only in memory; a page reload restores it via the refresh cookie. */
  accessToken: string | null;
}

interface AuthActions {
  setSession: (session: AuthResponse) => void;
  setUser: (user: UserDto) => void;
  clearSession: () => void;
}

const initialState: AuthState = { status: 'unknown', user: null, accessToken: null };

export const useAuthStore = create<AuthState & AuthActions>()((set) => ({
  ...initialState,
  setSession: ({ accessToken, user }) => set({ status: 'authenticated', accessToken, user }),
  setUser: (user) => set({ user }),
  clearSession: () => set({ status: 'anonymous', accessToken: null, user: null }),
}));

export const useAuthStatus = () => useAuthStore((state) => state.status);
export const useCurrentUser = () => useAuthStore((state) => state.user);

/** Test helper: back to the page-load state. */
export function resetAuthStore(): void {
  useAuthStore.setState(initialState);
}
