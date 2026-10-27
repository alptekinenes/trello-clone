import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiError, testUser } from '../../../test/fixtures';
import { server } from '../../../test/msw-server';
import { renderApp } from '../../../test/render';
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
      http.get('*/api/v1/health', () => HttpResponse.json({ status: 'ok' })),
    );
    const { router } = renderApp('/register');

    await fillAndSubmit({ name: 'Ayşe Yılmaz', email: 'ayse@example.com', password: 'secret-password' });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Panolarına hoş geldin' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
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
