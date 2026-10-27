import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../../test/msw-server';
import { renderWithProviders } from '../../../test/render';
import { HomePage } from './home-page';

describe('HomePage', () => {
  it('shows the page heading', () => {
    renderWithProviders(<HomePage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Panolarına hoş geldin' })).toBeInTheDocument();
  });

  it('shows a loading message, then that the API is up', async () => {
    server.use(http.get('*/api/v1/health', () => HttpResponse.json({ status: 'ok' })));
    renderWithProviders(<HomePage />);

    expect(screen.getByText('API durumu kontrol ediliyor…')).toBeInTheDocument();
    expect(await screen.findByText('API çalışıyor.')).toBeInTheDocument();
  });

  it('shows an error when the API is unreachable', async () => {
    server.use(http.get('*/api/v1/health', () => HttpResponse.error()));
    renderWithProviders(<HomePage />);

    expect(await screen.findByText(/API'ye ulaşılamıyor/)).toBeInTheDocument();
  });
});
