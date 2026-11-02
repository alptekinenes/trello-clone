import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { useAuthStore } from '../features/auth/store/auth-store';
import { testUser } from '../test/fixtures';
import { server } from '../test/msw-server';
import { renderApp } from '../test/render';

describe('routes', () => {
  it('sends a signed-in user from / to the boards page', async () => {
    useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
    server.use(http.get('*/api/v1/boards', () => HttpResponse.json([])));
    const { router } = renderApp('/');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Panolarım' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/boards');
    expect(screen.getByRole('link', { name: 'Trello Clone' })).toBeInTheDocument();
  });

  it('renders the not found page for unknown paths', async () => {
    renderApp('/yok-boyle-bir-sayfa');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sayfa bulunamadı' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ana sayfaya dön' })).toHaveAttribute('href', '/');
  });

  it('offers a skip link to the main content', async () => {
    renderApp('/yok-boyle-bir-sayfa');
    expect(await screen.findByRole('link', { name: 'İçeriğe geç' })).toHaveAttribute(
      'href',
      '#main',
    );
  });
});

describe('invitation route', () => {
  const PATH = `/invitations/${'c'.repeat(43)}`;

  it('opens for a signed-out visitor instead of sending them to login', async () => {
    useAuthStore.getState().clearSession();
    server.use(
      http.get(`*/api/v1${PATH}`, () =>
        HttpResponse.json({
          boardTitle: 'Yol haritası',
          inviterName: 'Ali Demir',
          email: 'bora@example.com',
          role: 'MEMBER',
          expiresAt: '2026-11-09T14:30:00.000Z',
        }),
      ),
    );
    const { router } = renderApp(PATH);

    expect(await screen.findByRole('heading', { level: 1, name: 'Panoya davet' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(PATH);
  });
});
