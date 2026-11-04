import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { useAuthStore } from '../features/auth/store/auth-store';
import { useRealtimeStore } from '../shared/store/realtime-store';
import { fakeRealtime } from '../test/fake-realtime';
import { APP_NAME } from '../shared/lib/app-name';
import { BOARD_ID, boardDetail, boardSummary, testUser } from '../test/fixtures';
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

describe('RootLayout header', () => {
  it('shows the app name and creates a board from the header, closing the dialog afterwards', async () => {
    useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
    server.use(
      http.get('*/api/v1/boards', () => HttpResponse.json([])),
      http.post('*/api/v1/boards', () =>
        HttpResponse.json(boardSummary({ title: 'Sprint 1' }), { status: 201 }),
      ),
      http.get(`*/api/v1/boards/${BOARD_ID}`, () =>
        HttpResponse.json(boardDetail('OWNER', 'Sprint 1')),
      ),
    );
    const { router } = renderApp('/boards');
    const user = userEvent.setup();

    expect(await screen.findByRole('link', { name: APP_NAME })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Yeni pano' }));
    const dialog = screen.getByRole('dialog', { name: 'Pano oluştur' });
    await user.type(within(dialog).getByLabelText('Pano adı'), 'Sprint 1');
    await user.click(within(dialog).getByRole('button', { name: 'Oluştur' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Sprint 1' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/boards/${BOARD_ID}`);
    expect(screen.queryByRole('dialog', { name: 'Pano oluştur' })).not.toBeInTheDocument();
  });
});
