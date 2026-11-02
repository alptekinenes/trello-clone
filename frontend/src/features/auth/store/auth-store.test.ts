import { describe, expect, it, vi } from 'vitest';
import { testUser } from '../../../test/fixtures';
import { onSignOut, useAuthStore } from './auth-store';

describe('auth store', () => {
  it('starts with an unknown session', () => {
    expect(useAuthStore.getState()).toMatchObject({ status: 'unknown', user: null, accessToken: null });
  });

  it('setSession marks the user as signed in', () => {
    useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
    expect(useAuthStore.getState()).toMatchObject({
      status: 'authenticated',
      user: testUser,
      accessToken: 'token',
    });
  });

  it('clearSession drops the user and the token', () => {
    useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
    useAuthStore.getState().clearSession();
    expect(useAuthStore.getState()).toMatchObject({ status: 'anonymous', user: null, accessToken: null });
  });

  it('setUser updates the profile and keeps the session', () => {
    useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
    useAuthStore.getState().setUser({ ...testUser, name: 'Yeni Ad' });
    expect(useAuthStore.getState()).toMatchObject({
      status: 'authenticated',
      accessToken: 'token',
      user: { name: 'Yeni Ad' },
    });
  });

  it('onSignOut tells when a signed-in session ends, but not for the check at page load', () => {
    const listener = vi.fn();
    const stop = onSignOut(listener);

    useAuthStore.getState().clearSession();
    expect(listener).not.toHaveBeenCalled();
    useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
    expect(listener).not.toHaveBeenCalled();
    useAuthStore.getState().clearSession();
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  });
});
