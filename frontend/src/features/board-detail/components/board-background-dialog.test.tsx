import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BoardRole, UpdateBoardRequest } from '@trello/contracts';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { useToastStore } from '../../../shared/store/toast-store';
import { BOARD_ID, apiError, boardDetail, boardSummary, testUser } from '../../../test/fixtures';
import { server } from '../../../test/msw-server';
import { renderApp } from '../../../test/render';
import { useAuthStore } from '../../auth/store/auth-store';

const BOARD_URL = `*/api/v1/boards/${BOARD_ID}`;

/** The fixture board is green. */
async function openBoard(role: BoardRole) {
  useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
  server.use(http.get(BOARD_URL, () => HttpResponse.json(boardDetail(role))));
  const view = renderApp(`/boards/${BOARD_ID}`);
  await screen.findByRole('heading', { level: 1, name: 'Yol haritası' });
  return { ...view, user: userEvent.setup() };
}

/** The element that paints the board background. */
const boardSurface = () => screen.getByRole('heading', { level: 1, hidden: true }).closest('header')?.parentElement;

describe('changing the board background', () => {
  it('offers no button to a MEMBER', async () => {
    await openBoard('MEMBER');

    expect(screen.queryByRole('button', { name: 'Arka plan' })).not.toBeInTheDocument();
  });

  it.each(['ADMIN', 'OWNER'] as const)('offers the button to an %s', async (role) => {
    await openBoard(role);

    expect(screen.getByRole('button', { name: 'Arka plan' })).toBeInTheDocument();
  });

  it('opens a dialog with the current background checked', async () => {
    const { user } = await openBoard('ADMIN');

    await user.click(screen.getByRole('button', { name: 'Arka plan' }));

    const dialog = await screen.findByRole('dialog', { name: 'Arka plan' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Yeşil' })).toBeChecked();
  });

  it('applies the choice at once and sends only the background', async () => {
    const { user } = await openBoard('ADMIN');
    let sent: UpdateBoardRequest | null = null;
    server.use(
      http.patch(BOARD_URL, async ({ request }) => {
        sent = (await request.json()) as UpdateBoardRequest;
        await delay(50);
        return HttpResponse.json(boardSummary({ background: 'purple', myRole: 'ADMIN' }));
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Arka plan' }));

    await user.click(await screen.findByRole('radio', { name: 'Mor' }));

    // Optimistic: painted before the server answers.
    expect(boardSurface()).toHaveClass('bg-board-purple');
    expect(screen.getByRole('radio', { name: 'Mor' })).toBeChecked();
    await waitFor(() => expect(sent).toEqual({ background: 'purple' }));
  });

  it('rolls back and shows an error toast when saving fails, without a title error', async () => {
    const { user } = await openBoard('ADMIN');
    server.use(http.patch(BOARD_URL, () => apiError(500, 'INTERNAL_ERROR')));
    await user.click(screen.getByRole('button', { name: 'Arka plan' }));

    await user.click(await screen.findByRole('radio', { name: 'Mor' }));

    await waitFor(() =>
      expect(useToastStore.getState().toasts.at(-1)).toMatchObject({
        tone: 'error',
        message: expect.stringContaining('Arka plan değiştirilemedi'),
      }),
    );
    expect(boardSurface()).toHaveClass('bg-board-green');
    expect(screen.getByRole('radio', { name: 'Yeşil' })).toBeChecked();
    expect(screen.queryByText(/Pano adı kaydedilemedi/)).not.toBeInTheDocument();
  });

  // Escape and the focus handback are the browser's own <dialog> behavior; e2e covers them.
  it('closes with its close button', async () => {
    const { user } = await openBoard('ADMIN');
    await user.click(screen.getByRole('button', { name: 'Arka plan' }));
    const dialog = await screen.findByRole('dialog', { name: 'Arka plan' });

    await user.click(within(dialog).getByRole('button', { name: 'Kapat' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
