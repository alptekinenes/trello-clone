import { act, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { useAuthStore } from '../features/auth/store/auth-store';
import { useRealtimeStore } from '../shared/store/realtime-store';
import { fakeRealtime } from '../test/fake-realtime';
import { testUser } from '../test/fixtures';
import { server } from '../test/msw-server';
import { renderApp } from '../test/render';

const status = () => useRealtimeStore.getState().status;

describe('RootLayout realtime connection', () => {
  it('connects once signed in and closes on sign-out', async () => {
    useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
    server.use(http.get('*/api/v1/boards', () => HttpResponse.json([])));
    renderApp('/boards');
    await screen.findByText(/Henüz bir panon yok/);
    expect(status()).toBe('connecting');

    fakeRealtime.connect();
    expect(status()).toBe('connected');

    act(() => useAuthStore.getState().clearSession());
    expect(status()).toBe('idle');
    expect(fakeRealtime.socket.connected).toBe(false);
  });

  it('stays closed for a signed-out visitor', async () => {
    useAuthStore.getState().clearSession();
    renderApp('/login');
    await screen.findByRole('button', { name: /Giriş yap/ });
    expect(status()).toBe('idle');
  });
});
