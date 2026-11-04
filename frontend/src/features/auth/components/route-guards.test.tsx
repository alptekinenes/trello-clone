import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { BOARD_ID, boardDetail, testUser } from '../../../test/fixtures';
import { server } from '../../../test/msw-server';
import { renderApp } from '../../../test/render';
import { useAuthStore } from '../store/auth-store';

function signIn() {
  useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
  server.use(http.get('*/api/v1/boards', () => HttpResponse.json([])));
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
      await screen.findByRole('heading', { level: 1, name: 'Panolarım' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/boards');
  });

  it('sends signed-in users from login to the returnUrl', async () => {
    signIn();
    server.use(http.get('*/api/v1/boards/*', () => HttpResponse.json(boardDetail())));
    const boardPath = `/boards/${BOARD_ID}`;
    const { router } = renderApp(`/login?returnUrl=${encodeURIComponent(boardPath)}`);

    await waitFor(() => expect(router.state.location.pathname).toBe(boardPath));
  });

  it('does not follow a returnUrl that leaves the site', async () => {
    signIn();
    const { router } = renderApp('/login?returnUrl=https%3A%2F%2Fevil.example');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Panolarım' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/boards');
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

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Hesap menüsü' }));
    await user.click(screen.getByRole('menuitem', { name: 'Çıkış yap' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Giriş yap' })).toBeInTheDocument();
    expect(loggedOut).toBe(true);
    expect(router.state.location.pathname).toBe('/login');
    expect(useAuthStore.getState()).toMatchObject({ status: 'anonymous', accessToken: null });
    expect(screen.queryByRole('button', { name: 'Hesap menüsü' })).not.toBeInTheDocument();
  });

  it('logs out locally even if the server call fails', async () => {
    signIn();
    server.use(http.post('*/api/v1/auth/logout', () => HttpResponse.error()));
    renderApp('/');

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Hesap menüsü' }));
    await user.click(screen.getByRole('menuitem', { name: 'Çıkış yap' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Giriş yap' })).toBeInTheDocument();
    expect(useAuthStore.getState().status).toBe('anonymous');
  });
});
