import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { routes } from '../../../app/routes';
import { BOARD_ID, apiError, boardDetail, testUser } from '../../../test/fixtures';
import { server } from '../../../test/msw-server';
import { renderApp, renderWithProviders } from '../../../test/render';
import { useAuthStore } from '../store/auth-store';

function signedOut() {
  useAuthStore.getState().clearSession();
}

function noBoards() {
  server.use(http.get('*/api/v1/boards', () => HttpResponse.json([])));
}

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('E-posta'), email);
  await user.type(screen.getByLabelText('Parola'), password);
  await user.click(screen.getByRole('button', { name: 'Giriş yap' }));
}

describe('LoginPage', () => {
  it('shows labeled fields and a link to register', () => {
    signedOut();
    renderApp('/login');

    expect(screen.getByRole('heading', { level: 1, name: 'Giriş yap' })).toBeInTheDocument();
    expect(screen.getByLabelText('E-posta')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText('Parola')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('link', { name: 'Kayıt ol' })).toHaveAttribute('href', '/register');
  });

  it('validates on the client without calling the API', async () => {
    signedOut();
    renderApp('/login');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Giriş yap' }));

    expect(await screen.findByText('E-posta adresini gir.')).toBeInTheDocument();
    expect(screen.getByText('Parolanı gir.')).toBeInTheDocument();
    const email = screen.getByLabelText('E-posta');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('E-posta adresini gir.');
    expect(email).toHaveFocus();
  });

  it('signs in and returns to the page the user wanted', async () => {
    signedOut();
    noBoards();
    let body: unknown;
    server.use(
      http.post('*/api/v1/auth/login', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ accessToken: 'token', user: testUser });
      }),
    );
    const { router } = renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Giriş yap' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');

    await fillAndSubmit('  ayse@example.com ', 'secret-password');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Panolarım' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/boards');
    expect(body).toEqual({ email: 'ayse@example.com', password: 'secret-password' });
    expect(screen.getByText(testUser.name)).toBeInTheDocument();
    expect(useAuthStore.getState()).toMatchObject({ status: 'authenticated', accessToken: 'token' });
  });

  it('shows a message for wrong credentials and stays on the page', async () => {
    signedOut();
    server.use(http.post('*/api/v1/auth/login', () => apiError(401, 'INVALID_CREDENTIALS')));
    const { router } = renderApp('/login');

    await fillAndSubmit('ayse@example.com', 'wrong-password');

    expect(await screen.findByRole('alert')).toHaveTextContent('E-posta veya parola hatalı.');
    expect(router.state.location.pathname).toBe('/login');
    expect(useAuthStore.getState().status).toBe('anonymous');
  });

  it('explains rate limiting', async () => {
    signedOut();
    server.use(http.post('*/api/v1/auth/login', () => apiError(429, 'TOO_MANY_REQUESTS')));
    renderApp('/login');

    await fillAndSubmit('ayse@example.com', 'secret-password');

    expect(await screen.findByRole('alert')).toHaveTextContent('Çok fazla deneme yaptın');
  });

  describe('with a returnUrl', () => {
    const signInHandler = () =>
      server.use(
        http.post('*/api/v1/auth/login', () =>
          HttpResponse.json({ accessToken: 'token', user: testUser }),
        ),
        http.get('*/api/v1/boards/*', () => HttpResponse.json(boardDetail())),
      );

    it('goes there after signing in', async () => {
      signedOut();
      signInHandler();
      const boardPath = `/boards/${BOARD_ID}`;
      const { router } = renderApp(`/login?returnUrl=${encodeURIComponent(boardPath)}`);

      await fillAndSubmit('ayse@example.com', 'secret-password');

      await waitFor(() => expect(router.state.location.pathname).toBe(boardPath));
    });

    it('stays within the site', async () => {
      signedOut();
      noBoards();
      signInHandler();
      const { router } = renderApp('/login?returnUrl=%2F%2Fevil.example');

      await fillAndSubmit('ayse@example.com', 'secret-password');

      await waitFor(() => expect(router.state.location.pathname).toBe('/boards'));
    });

    it('keeps it on the link to the register page', () => {
      signedOut();
      renderApp('/login?returnUrl=%2Fboards%2FB');

      expect(screen.getByRole('link', { name: 'Kayıt ol' })).toHaveAttribute(
        'href',
        '/register?returnUrl=%2Fboards%2FB',
      );
    });

    it('fills in the email a link handed over', async () => {
      signedOut();
      const router = createMemoryRouter(routes, {
        initialEntries: [{ pathname: '/login', state: { email: 'b@example.com' } }],
      });
      renderWithProviders(<RouterProvider router={router} />);

      expect(await screen.findByLabelText('E-posta')).toHaveValue('b@example.com');
    });
  });
});
