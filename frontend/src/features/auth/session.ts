import { ApiError, setAuthHandlers } from '../../shared/lib/http';
import { authApi } from './api/auth-api';
import { useAuthStore } from './store/auth-store';

let refreshInFlight: Promise<string | null> | null = null;

async function runRefresh(): Promise<string | null> {
  try {
    const session = await authApi.refresh();
    useAuthStore.getState().setSession(session);
    return session.accessToken;
  } catch (error) {
    const { status, clearSession } = useAuthStore.getState();
    const sessionGone = error instanceof ApiError && error.status === 401;
    // On page load any failure means "not signed in". Mid-session, only a 401
    // ends the session; a network blip keeps the user where they are.
    if (sessionGone || status === 'unknown') clearSession();
    return null;
  }
}

/**
 * Renews the session with the httpOnly refresh cookie and returns the new
 * access token. Parallel callers share one request, so the token rotates once.
 */
export function refreshSession(): Promise<string | null> {
  refreshInFlight ??= runRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** Connects the shared HTTP client to the session. Call once at startup. */
export function installAuth(): void {
  setAuthHandlers({
    getAccessToken: () => useAuthStore.getState().accessToken,
    refreshAccessToken: refreshSession,
  });
}

/** Restores the session after a page load (the access token lives only in memory). */
export async function bootstrapSession(): Promise<void> {
  if (useAuthStore.getState().status !== 'unknown') return;
  await refreshSession();
}
