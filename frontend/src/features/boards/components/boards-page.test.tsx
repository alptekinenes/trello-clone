import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CreateBoardRequest } from '@trello/contracts';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { useAuthStore } from '../../auth/store/auth-store';
import {
  BOARD_ID,
  apiError,
  boardDetail,
  boardSummary,
  testUser,
} from '../../../test/fixtures';
import { server } from '../../../test/msw-server';
import { renderApp } from '../../../test/render';

function signIn() {
  useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
}

describe('BoardsPage', () => {
  it('lists the boards as links to their pages', async () => {
    signIn();
    server.use(
      http.get('*/api/v1/boards', () =>
        HttpResponse.json([
          boardSummary(),
          boardSummary({ id: '33333333-3333-4333-8333-333333333333', title: 'Pazarlama' }),
        ]),
      ),
    );
    renderApp('/boards');

    expect(await screen.findByRole('link', { name: 'Yol haritası' })).toHaveAttribute(
      'href',
      `/boards/${BOARD_ID}`,
    );
    expect(screen.getByRole('link', { name: 'Pazarlama' })).toBeInTheDocument();
    expect(screen.queryByText(/Henüz bir panon yok/)).not.toBeInTheDocument();
  });

  it('shows a hint when there are no boards', async () => {
    signIn();
    server.use(http.get('*/api/v1/boards', () => HttpResponse.json([])));
    renderApp('/boards');

    expect(await screen.findByText(/Henüz bir panon yok/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yeni pano oluştur' })).toBeInTheDocument();
  });

  it('shows an error with a retry button', async () => {
    signIn();
    let calls = 0;
    server.use(
      http.get('*/api/v1/boards', () => {
        calls += 1;
        return calls === 1
          ? apiError(500, 'INTERNAL_ERROR')
          : HttpResponse.json([boardSummary()]);
      }),
    );
    renderApp('/boards');

    expect(await screen.findByRole('alert')).toHaveTextContent('Sunucuya şu an ulaşılamıyor');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tekrar dene' }));

    expect(await screen.findByRole('link', { name: 'Yol haritası' })).toBeInTheDocument();
  });

  describe('creating a board', () => {
    it('validates the title', async () => {
      signIn();
      server.use(http.get('*/api/v1/boards', () => HttpResponse.json([])));
      renderApp('/boards');
      const user = userEvent.setup();

      await user.click(await screen.findByRole('button', { name: 'Yeni pano oluştur' }));
      const dialog = screen.getByRole('dialog', { name: 'Pano oluştur' });
      await user.click(within(dialog).getByRole('button', { name: 'Oluştur' }));

      expect(await within(dialog).findByText('Pano adını gir.')).toBeInTheDocument();
      expect(within(dialog).getByLabelText('Pano adı')).toHaveAttribute('aria-invalid', 'true');
    });

    it('creates the board with the chosen background and opens it', async () => {
      signIn();
      let sent: CreateBoardRequest | null = null;
      server.use(
        http.get('*/api/v1/boards', () => HttpResponse.json([])),
        http.post('*/api/v1/boards', async ({ request }) => {
          sent = (await request.json()) as CreateBoardRequest;
          return HttpResponse.json(boardSummary({ title: 'Sprint 1', background: 'purple' }), {
            status: 201,
          });
        }),
        http.get(`*/api/v1/boards/${BOARD_ID}`, () =>
          HttpResponse.json(boardDetail('OWNER', 'Sprint 1')),
        ),
      );
      const { router } = renderApp('/boards');
      const user = userEvent.setup();

      await user.click(await screen.findByRole('button', { name: 'Yeni pano oluştur' }));
      const dialog = screen.getByRole('dialog', { name: 'Pano oluştur' });
      await user.type(within(dialog).getByLabelText('Pano adı'), '  Sprint 1 ');
      await user.click(within(dialog).getByRole('radio', { name: 'Mor' }));
      await user.click(within(dialog).getByRole('button', { name: 'Oluştur' }));

      expect(await screen.findByRole('heading', { level: 1, name: 'Sprint 1' })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe(`/boards/${BOARD_ID}`);
      expect(sent).toEqual({ title: 'Sprint 1', background: 'purple' });
    });

    it('shows a server error and keeps the dialog open', async () => {
      signIn();
      server.use(
        http.get('*/api/v1/boards', () => HttpResponse.json([])),
        http.post('*/api/v1/boards', () => apiError(500, 'INTERNAL_ERROR')),
      );
      renderApp('/boards');
      const user = userEvent.setup();

      await user.click(await screen.findByRole('button', { name: 'Yeni pano oluştur' }));
      const dialog = screen.getByRole('dialog', { name: 'Pano oluştur' });
      await user.type(within(dialog).getByLabelText('Pano adı'), 'Proje');
      await user.click(within(dialog).getByRole('button', { name: 'Oluştur' }));

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Sunucuya şu an ulaşılamıyor',
      );
    });

    it('closes the dialog with Vazgeç', async () => {
      signIn();
      server.use(http.get('*/api/v1/boards', () => HttpResponse.json([])));
      renderApp('/boards');
      const user = userEvent.setup();

      await user.click(await screen.findByRole('button', { name: 'Yeni pano oluştur' }));
      await user.click(screen.getByRole('button', { name: 'Vazgeç' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
