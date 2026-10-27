import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BoardRole, UpdateBoardRequest } from '@trello/contracts';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../auth/store/auth-store';
import { BOARD_ID, apiError, boardDetail, boardSummary, testUser } from '../../../test/fixtures';
import { server } from '../../../test/msw-server';
import { renderApp } from '../../../test/render';

const BOARD_URL = `*/api/v1/boards/${BOARD_ID}`;

function openBoard(role: BoardRole = 'OWNER') {
  useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
  server.use(http.get(BOARD_URL, () => HttpResponse.json(boardDetail(role))));
  const result = renderApp(`/boards/${BOARD_ID}`);
  return { ...result, user: userEvent.setup() };
}

describe('BoardPage', () => {
  it('shows the board title and members', async () => {
    openBoard();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Yol haritası' }),
    ).toBeInTheDocument();
    const members = screen.getByRole('list', { name: 'Pano üyeleri' });
    expect(within(members).getByText(testUser.name)).toBeInTheDocument();
  });

  it('shows a not found page for a missing or foreign board', async () => {
    useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
    server.use(http.get(BOARD_URL, () => apiError(404, 'NOT_FOUND')));
    renderApp(`/boards/${BOARD_ID}`);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Pano bulunamadı' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Panolarına dön' })).toHaveAttribute('href', '/boards');
  });

  describe('renaming', () => {
    it('updates the title at once and sends it to the server', async () => {
      const { user } = openBoard('ADMIN');
      let sent: UpdateBoardRequest | null = null;
      server.use(
        http.patch(BOARD_URL, async ({ request }) => {
          sent = (await request.json()) as UpdateBoardRequest;
          await delay(50);
          return HttpResponse.json(boardSummary({ title: 'Yeni ad', myRole: 'ADMIN' }));
        }),
      );

      await user.click(await screen.findByRole('button', { name: 'Yol haritası' }));
      const input = screen.getByRole('textbox', { name: 'Pano adı' });
      await user.clear(input);
      await user.type(input, 'Yeni ad{Enter}');

      // Optimistic: visible before the server answers.
      expect(screen.getByRole('heading', { level: 1, name: 'Yeni ad' })).toBeInTheDocument();
      await vi.waitFor(() => expect(sent).toEqual({ title: 'Yeni ad' }));
    });

    it('rolls back and shows an error when saving fails', async () => {
      const { user } = openBoard('OWNER');
      server.use(http.patch(BOARD_URL, () => apiError(500, 'INTERNAL_ERROR')));

      await user.click(await screen.findByRole('button', { name: 'Yol haritası' }));
      const input = screen.getByRole('textbox', { name: 'Pano adı' });
      await user.clear(input);
      await user.type(input, 'Yeni ad{Enter}');

      expect(await screen.findByRole('alert')).toHaveTextContent('Pano adı kaydedilemedi');
      expect(screen.getByRole('heading', { level: 1, name: 'Yol haritası' })).toBeInTheDocument();
    });

    it('is not offered to members', async () => {
      openBoard('MEMBER');

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Yol haritası' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Yol haritası' })).not.toBeInTheDocument();
    });
  });

  describe('deleting', () => {
    it('asks for confirmation, deletes and returns to the board list', async () => {
      const { user, router } = openBoard('OWNER');
      let deleted = false;
      let fetchedAfterDelete = 0;
      server.use(
        http.delete(BOARD_URL, () => {
          deleted = true;
          return new HttpResponse(null, { status: 204 });
        }),
        http.get(BOARD_URL, () => {
          if (!deleted) return HttpResponse.json(boardDetail('OWNER'));
          fetchedAfterDelete += 1;
          return apiError(404, 'NOT_FOUND');
        }),
        http.get('*/api/v1/boards', () => HttpResponse.json([])),
      );

      await user.click(await screen.findByRole('button', { name: 'Panoyu sil' }));
      const dialog = screen.getByRole('dialog', { name: 'Pano silinsin mi?' });
      expect(deleted).toBe(false);
      await user.click(within(dialog).getByRole('button', { name: 'Panoyu sil' }));

      expect(await screen.findByRole('heading', { level: 1, name: 'Panolarım' })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/boards');
      expect(deleted).toBe(true);
      // The deleted board is not requested again on the way out.
      expect(fetchedAfterDelete).toBe(0);
    });

    it('can be cancelled', async () => {
      const { user } = openBoard('OWNER');

      await user.click(await screen.findByRole('button', { name: 'Panoyu sil' }));
      await user.click(screen.getByRole('button', { name: 'Vazgeç' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('shows an error and stays on the board when deletion fails', async () => {
      const { user, router } = openBoard('OWNER');
      server.use(http.delete(BOARD_URL, () => apiError(403, 'FORBIDDEN')));

      await user.click(await screen.findByRole('button', { name: 'Panoyu sil' }));
      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Panoyu sil' }));

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Bu işlem için yetkin yok.',
      );
      expect(router.state.location.pathname).toBe(`/boards/${BOARD_ID}`);
    });

    it.each(['ADMIN', 'MEMBER'] as const)('is only offered to the owner, not %s', async (role) => {
      openBoard(role);

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Yol haritası' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Panoyu sil' })).not.toBeInTheDocument();
    });
  });
});
