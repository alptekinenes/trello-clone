import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { useAuthStore } from '../features/auth/store/auth-store';
import { testUser } from '../test/fixtures';
import { server } from '../test/msw-server';
import { renderApp } from '../test/render';

describe('routes', () => {
  it('renders the home page at / for a signed-in user', async () => {
    useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
    server.use(http.get('*/api/v1/health', () => HttpResponse.json({ status: 'ok' })));
    renderApp('/');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Panolarına hoş geldin' }),
    ).toBeInTheDocument();
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
