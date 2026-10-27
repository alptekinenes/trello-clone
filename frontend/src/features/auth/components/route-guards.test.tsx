import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { testUser } from '../../../test/fixtures';
import { server } from '../../../test/msw-server';
import { renderApp } from '../../../test/render';
import { useAuthStore } from '../store/auth-store';

function signIn() {
  useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
  server.use(http.get('*/api/v1/health', () => HttpResponse.json({ status: 'ok' })));
}

describe('route guards', () => {
  it('shows a loader while the session is being checked', async () => {
    renderApp('/');
    expect(await screen.findByRole('status')).toHaveTextContent('Oturum kontrol ediliyor…');
  });

  it('sends signed-out users from a protected page to login', async () => {
    useAuthStore.getState().clearSession();
    const { router } = renderApp('/');

    expect(await screen.findByRole('heading', { level: 1, name: 'Giriş yap' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('sends signed-in users away from login and register', async () => {
    signIn();
    const { router } = renderApp('/register');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Panolarına hoş geldin' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('logs out from the header and returns to login', async () => {
    signIn();
    let loggedOut = false;
    server.use(
      http.post('*/api/v1/auth/logout', () => {
        loggedOut = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { router } = renderApp('/');

    expect(await screen.findByText(testUser.name)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Çıkış yap' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Giriş yap' })).toBeInTheDocument();
    expect(loggedOut).toBe(true);
    expect(router.state.location.pathname).toBe('/login');
    expect(useAuthStore.getState()).toMatchObject({ status: 'anonymous', accessToken: null });
    expect(screen.queryByText(testUser.name)).not.toBeInTheDocument();
  });

  it('logs out locally even if the server call fails', async () => {
    signIn();
    server.use(http.post('*/api/v1/auth/logout', () => HttpResponse.error()));
    renderApp('/');

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Çıkış yap' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Giriş yap' })).toBeInTheDocument();
    expect(useAuthStore.getState().status).toBe('anonymous');
  });
});
