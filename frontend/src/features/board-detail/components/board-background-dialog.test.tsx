import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { QueryClient } from '@tanstack/react-query';
import type {
  BoardBackground,
  BoardDetailDto,
  BoardRole,
  UpdateBoardRequest,
} from '@trello/contracts';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { useToastStore } from '../../../shared/store/toast-store';
import { BOARD_ID, apiError, boardDetail, boardSummary, testUser } from '../../../test/fixtures';
import { boardMenuItemNames, selectBoardMenuItem } from '../../../test/board-menu';
import { server } from '../../../test/msw-server';
import { renderApp } from '../../../test/render';
import { useAuthStore } from '../../auth/store/auth-store';
import { boardKeys } from '../../boards';

const BOARD_URL = `*/api/v1/boards/${BOARD_ID}`;

/** The fixture board is green. */
async function openBoard(role: BoardRole) {
  useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
  server.use(http.get(BOARD_URL, () => HttpResponse.json(boardDetail(role))));
  const view = renderApp(`/boards/${BOARD_ID}`);
  await screen.findByRole('heading', { level: 1, name: 'Yol haritası' });
  return { ...view, user: userEvent.setup() };
}

interface Answer {
  fail?: boolean;
  /** The server does not answer until `release` is called for this background. */
  hold?: boolean;
}

/**
 * A server that keeps the board's background: GET tells the truth, PATCH changes it unless
 * told to fail. Records the order of requests and how many were in flight at once.
 */
function serveBackground(answers: Partial<Record<BoardBackground, Answer>>) {
  const releases = new Map<BoardBackground, () => void>();
  const backend = {
    background: 'green' as BoardBackground,
    requests: [] as BoardBackground[],
    inFlight: 0,
    maxInFlight: 0,
    release: (background: BoardBackground) => releases.get(background)?.(),
  };
  server.use(
    http.get(BOARD_URL, () =>
      HttpResponse.json({
        ...boardDetail('ADMIN'),
        board: boardSummary({ background: backend.background, myRole: 'ADMIN' }),
      }),
    ),
    http.patch(BOARD_URL, async ({ request }) => {
      const { background } = (await request.json()) as { background: BoardBackground };
      const answer = answers[background] ?? {};
      backend.requests.push(background);
      backend.inFlight += 1;
      backend.maxInFlight = Math.max(backend.maxInFlight, backend.inFlight);
      if (answer.hold) await new Promise<void>((resolve) => releases.set(background, resolve));
      backend.inFlight -= 1;
      if (answer.fail) return apiError(500, 'INTERNAL_ERROR');
      backend.background = background;
      return HttpResponse.json(boardSummary({ background, myRole: 'ADMIN' }));
    }),
  );
  return backend;
}

/** Every background the cached board had, in order, without repeats. */
function recordBackgrounds(queryClient: QueryClient): BoardBackground[] {
  const seen: BoardBackground[] = [];
  const read = () => queryClient.getQueryData<BoardDetailDto>(boardKeys.detail(BOARD_ID))?.board.background;
  const remember = () => {
    const current = read();
    if (current && seen.at(-1) !== current) seen.push(current);
  };
  remember();
  queryClient.getQueryCache().subscribe(remember);
  return seen;
}

/** The element that paints the board background. */
const boardSurface = () => screen.getByRole('heading', { level: 1, hidden: true }).closest('header')?.parentElement;

describe('changing the board background', () => {
  it('offers no menu item to a MEMBER', async () => {
    const { user } = await openBoard('MEMBER');

    expect(await boardMenuItemNames(user)).not.toContain('Arka plan');
  });

  it.each(['ADMIN', 'OWNER'] as const)('offers the menu item to an %s', async (role) => {
    const { user } = await openBoard(role);

    expect(await boardMenuItemNames(user)).toContain('Arka plan');
  });

  it('opens a dialog with the current background checked', async () => {
    const { user } = await openBoard('ADMIN');

    await selectBoardMenuItem(user, 'Arka plan');

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
    await selectBoardMenuItem(user, 'Arka plan');

    await user.click(await screen.findByRole('radio', { name: 'Mor' }));

    // Optimistic: painted before the server answers.
    expect(boardSurface()).toHaveClass('bg-board-purple');
    expect(screen.getByRole('radio', { name: 'Mor' })).toBeChecked();
    await waitFor(() => expect(sent).toEqual({ background: 'purple' }));
  });

  // A modal makes the page behind it inert, so the message must be inside the dialog.
  it('rolls back and shows the error inside the open dialog, without a title error', async () => {
    const { user } = await openBoard('ADMIN');
    server.use(http.patch(BOARD_URL, () => apiError(500, 'INTERNAL_ERROR')));
    await selectBoardMenuItem(user, 'Arka plan');
    const dialog = await screen.findByRole('dialog', { name: 'Arka plan' });

    await user.click(within(dialog).getByRole('radio', { name: 'Mor' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Arka plan değiştirilemedi');
    expect(boardSurface()).toHaveClass('bg-board-green');
    expect(within(dialog).getByRole('radio', { name: 'Yeşil' })).toBeChecked();
    expect(screen.queryByText(/Pano adı kaydedilemedi/)).not.toBeInTheDocument();
  });

  it('falls back to a toast when the dialog was closed while the request was on its way', async () => {
    const { user } = await openBoard('ADMIN');
    const backend = serveBackground({ purple: { fail: true, hold: true } });
    await selectBoardMenuItem(user, 'Arka plan');
    const dialog = await screen.findByRole('dialog', { name: 'Arka plan' });
    await user.click(within(dialog).getByRole('radio', { name: 'Mor' }));
    await waitFor(() => expect(backend.requests).toEqual(['purple']));

    await user.click(within(dialog).getByRole('button', { name: 'Kapat' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    backend.release('purple');

    await waitFor(() =>
      expect(useToastStore.getState().toasts.at(-1)).toMatchObject({
        tone: 'error',
        message: expect.stringContaining('Arka plan değiştirilemedi'),
      }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('forgets the error when the dialog is closed and opened again', async () => {
    const { user } = await openBoard('ADMIN');
    server.use(http.patch(BOARD_URL, () => apiError(500, 'INTERNAL_ERROR')));
    await selectBoardMenuItem(user, 'Arka plan');
    const dialog = await screen.findByRole('dialog', { name: 'Arka plan' });
    await user.click(within(dialog).getByRole('radio', { name: 'Mor' }));
    await within(dialog).findByRole('alert');

    await user.click(within(dialog).getByRole('button', { name: 'Kapat' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await selectBoardMenuItem(user, 'Arka plan');

    const reopened = await screen.findByRole('dialog', { name: 'Arka plan' });
    expect(within(reopened).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears the error when the next choice is made', async () => {
    const { user } = await openBoard('ADMIN');
    const backend = serveBackground({ purple: { fail: true }, orange: {} });
    await selectBoardMenuItem(user, 'Arka plan');
    const dialog = await screen.findByRole('dialog', { name: 'Arka plan' });
    await user.click(within(dialog).getByRole('radio', { name: 'Mor' }));
    await within(dialog).findByRole('alert');

    await user.click(within(dialog).getByRole('radio', { name: 'Turuncu' }));

    await waitFor(() => expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument());
    await waitFor(() => expect(backend.background).toBe('orange'));
    await waitFor(() => expect(boardSurface()).toHaveClass('bg-board-orange'));
  });

  describe('quick successive choices (arrow keys on the picker)', () => {
    it('keeps the later choice when the earlier one fails', async () => {
      const { user, queryClient } = await openBoard('ADMIN');
      const backend = serveBackground({ purple: { fail: true, hold: true } });
      const backgrounds = recordBackgrounds(queryClient);
      await selectBoardMenuItem(user, 'Arka plan');
      const dialog = await screen.findByRole('dialog', { name: 'Arka plan' });

      await user.click(within(dialog).getByRole('radio', { name: 'Mor' }));
      await user.click(within(dialog).getByRole('radio', { name: 'Turuncu' }));
      // The later choice waits for the earlier request instead of racing it.
      await waitFor(() => expect(backend.requests).toEqual(['purple']));
      backend.release('purple');

      await waitFor(() => expect(backend.requests).toEqual(['purple', 'orange']));
      await waitFor(() => expect(backend.background).toBe('orange'));
      await waitFor(() => expect(queryClient.isMutating()).toBe(0));
      await waitFor(() => expect(queryClient.isFetching()).toBe(0));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Arka plan değiştirilemedi');
      expect(within(dialog).getByRole('radio', { name: 'Turuncu' })).toBeChecked();
      expect(boardSurface()).toHaveClass('bg-board-orange');
      // The failed earlier choice never takes the board back to the old color once the later one is shown.
      expect(backgrounds).toEqual(['green', 'purple', 'orange']);
      // One request at a time: the server applies them in the order they were chosen.
      expect(backend.maxInFlight).toBe(1);
    });

    it('rolls back only the later choice when it fails after the earlier one succeeded', async () => {
      const { user, queryClient } = await openBoard('ADMIN');
      const backend = serveBackground({ purple: { hold: true }, orange: { fail: true } });
      await selectBoardMenuItem(user, 'Arka plan');
      const dialog = await screen.findByRole('dialog', { name: 'Arka plan' });

      await user.click(within(dialog).getByRole('radio', { name: 'Mor' }));
      await user.click(within(dialog).getByRole('radio', { name: 'Turuncu' }));
      await waitFor(() => expect(backend.requests).toEqual(['purple']));
      backend.release('purple');

      await waitFor(() => expect(backend.requests).toEqual(['purple', 'orange']));
      await waitFor(() => expect(queryClient.isMutating()).toBe(0));
      await waitFor(() => expect(queryClient.isFetching()).toBe(0));
      expect(backend.background).toBe('purple');
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Arka plan değiştirilemedi');
      expect(within(dialog).getByRole('radio', { name: 'Mor' })).toBeChecked();
      expect(boardSurface()).toHaveClass('bg-board-purple');
      expect(backend.maxInFlight).toBe(1);
    });

    it('shows the later choice at once while the earlier request is still on its way', async () => {
      const { user } = await openBoard('ADMIN');
      const backend = serveBackground({ purple: { hold: true } });
      await selectBoardMenuItem(user, 'Arka plan');
      const dialog = await screen.findByRole('dialog', { name: 'Arka plan' });

      await user.click(within(dialog).getByRole('radio', { name: 'Mor' }));
      await user.click(within(dialog).getByRole('radio', { name: 'Turuncu' }));

      expect(within(dialog).getByRole('radio', { name: 'Turuncu' })).toBeChecked();
      expect(boardSurface()).toHaveClass('bg-board-orange');
      expect(backend.requests).toEqual(['purple']);
      backend.release('purple');
      await waitFor(() => expect(backend.background).toBe('orange'));
      expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  // Escape and the focus handback are the browser's own <dialog> behavior; e2e covers them.
  it('closes with its close button', async () => {
    const { user } = await openBoard('ADMIN');
    await selectBoardMenuItem(user, 'Arka plan');
    const dialog = await screen.findByRole('dialog', { name: 'Arka plan' });

    await user.click(within(dialog).getByRole('button', { name: 'Kapat' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
