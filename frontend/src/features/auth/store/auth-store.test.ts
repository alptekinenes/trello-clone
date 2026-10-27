import { describe, expect, it } from 'vitest';
import { testUser } from '../../../test/fixtures';
import { useAuthStore } from './auth-store';

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
});
