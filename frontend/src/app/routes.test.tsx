import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { describe, expect, it } from 'vitest';
import { server } from '../test/msw-server';
import { renderWithProviders } from '../test/render';
import { routes } from './routes';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return renderWithProviders(<RouterProvider router={router} />);
}

describe('routes', () => {
  it('renders the home page at /', async () => {
    server.use(http.get('*/api/v1/health', () => HttpResponse.json({ status: 'ok' })));
    renderAt('/');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Panolarına hoş geldin' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trello Clone' })).toBeInTheDocument();
  });

  it('renders the not found page for unknown paths', async () => {
    renderAt('/yok-boyle-bir-sayfa');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sayfa bulunamadı' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ana sayfaya dön' })).toHaveAttribute('href', '/');
  });

  it('offers a skip link to the main content', async () => {
    renderAt('/yok-boyle-bir-sayfa');
    expect(await screen.findByRole('link', { name: 'İçeriğe geç' })).toHaveAttribute(
      'href',
      '#main',
    );
  });
});
