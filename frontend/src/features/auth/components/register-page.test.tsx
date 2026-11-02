import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiError, testUser } from '../../../test/fixtures';
import { server } from '../../../test/msw-server';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { routes } from '../../../app/routes';
import { renderApp, renderWithProviders } from '../../../test/render';
import { useAuthStore } from '../store/auth-store';

async function fillAndSubmit(values: { name: string; email: string; password: string }) {
  const user = userEvent.setup();
  if (values.name) await user.type(screen.getByLabelText('Ad soyad'), values.name);
  if (values.email) await user.type(screen.getByLabelText('E-posta'), values.email);
  if (values.password) await user.type(screen.getByLabelText('Parola'), values.password);
  await user.click(screen.getByRole('button', { name: 'Kayıt ol' }));
}

describe('RegisterPage', () => {
  it('shows the password rule as a hint', () => {
    useAuthStore.getState().clearSession();
    renderApp('/register');

    expect(screen.getByRole('heading', { level: 1, name: 'Hesap oluştur' })).toBeInTheDocument();
    expect(screen.getByLabelText('Parola')).toHaveAccessibleDescription('En az 8 karakter.');
    expect(screen.getByLabelText('Parola')).toHaveAttribute('autocomplete', 'new-password');
  });

  it('validates name and password length on the client', async () => {
    useAuthStore.getState().clearSession();
    renderApp('/register');

    await fillAndSubmit({ name: '', email: 'ayse@example.com', password: 'short' });

    expect(await screen.findByText('Adını gir.')).toBeInTheDocument();
    expect(screen.getByText('Parola en az 8 karakter olmalı.')).toBeInTheDocument();
  });

  it('creates the account and signs the user in', async () => {
    useAuthStore.getState().clearSession();
    server.use(
      http.post('*/api/v1/auth/register', () =>
        HttpResponse.json({ accessToken: 'token', user: testUser }, { status: 201 }),
      ),
      http.get('*/api/v1/boards', () => HttpResponse.json([])),
    );
    const { router } = renderApp('/register');

    await fillAndSubmit({ name: 'Ayşe Yılmaz', email: 'ayse@example.com', password: 'secret-password' });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Panolarım' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/boards');
    expect(useAuthStore.getState().status).toBe('authenticated');
  });

  it('shows a taken email on the email field', async () => {
    useAuthStore.getState().clearSession();
    server.use(http.post('*/api/v1/auth/register', () => apiError(409, 'EMAIL_TAKEN')));
    renderApp('/register');

    await fillAndSubmit({ name: 'Ayşe', email: 'ayse@example.com', password: 'secret-password' });

    const email = screen.getByLabelText('E-posta');
    expect(
      await screen.findByText('Bu e-posta adresiyle kayıtlı bir hesap zaten var.'),
    ).toBeInTheDocument();
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('Bu e-posta adresiyle kayıtlı bir hesap zaten var.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a general alert when the server is down', async () => {
    useAuthStore.getState().clearSession();
    server.use(http.post('*/api/v1/auth/register', () => new HttpResponse(null, { status: 502 })));
    renderApp('/register');

    await fillAndSubmit({ name: 'Ayşe', email: 'ayse@example.com', password: 'secret-password' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Sunucuya şu an ulaşılamıyor');
  });
});

describe('RegisterPage with a returnUrl', () => {
  const INVITATION_PATH = `/invitations/${'a'.repeat(43)}`;

  it('goes back there after signing up, with the email a link handed over', async () => {
    useAuthStore.getState().clearSession();
    let body: unknown;
    server.use(
      http.post('*/api/v1/auth/register', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ accessToken: 'token', user: testUser }, { status: 201 });
      }),
      http.get('*/api/v1/invitations/*', () => new HttpResponse(null, { status: 404 })),
    );
    const router = createMemoryRouter(routes, {
      initialEntries: [
        {
          pathname: '/register',
          search: `?returnUrl=${encodeURIComponent(INVITATION_PATH)}`,
          state: { email: 'b@example.com' },
        },
      ],
    });
    renderWithProviders(<RouterProvider router={router} />);
    expect(await screen.findByLabelText('E-posta')).toHaveValue('b@example.com');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Ad soyad'), 'Bora Kaya');
    await user.type(screen.getByLabelText('Parola'), 'secret-password');
    await user.click(screen.getByRole('button', { name: 'Kayıt ol' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(INVITATION_PATH));
    expect(body).toEqual({ name: 'Bora Kaya', email: 'b@example.com', password: 'secret-password' });
  });

  it('keeps it on the link to the login page', () => {
    useAuthStore.getState().clearSession();
    renderApp('/register?returnUrl=%2Fboards%2FB');

    expect(screen.getByRole('link', { name: 'Giriş yap' })).toHaveAttribute(
      'href',
      '/login?returnUrl=%2Fboards%2FB',
    );
  });
});
