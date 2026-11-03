import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { useAuthStore } from '../../auth/store/auth-store';
import { useToastStore } from '../../../shared/store/toast-store';
import { fakeRealtime } from '../../../test/fake-realtime';
import { BOARD_ID, boardSummary, testUser } from '../../../test/fixtures';
import { server } from '../../../test/msw-server';
import { renderApp } from '../../../test/render';
import { boardKeys } from '../api/board-keys';

const OTHER_ID = '33333333-3333-4333-8333-333333333333';

async function openBoardsPage() {
  useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
  server.use(http.get('*/api/v1/boards', () => HttpResponse.json([boardSummary()])));
  const view = renderApp('/boards');
  await screen.findByRole('link', { name: 'Yol haritası' });
  fakeRealtime.connect();
  return view;
}

describe('useBoardListRealtime', () => {
  it('shows a board the user was just added to', async () => {
    await openBoardsPage();

    fakeRealtime.serverEmit(
      'membership:added',
      boardSummary({ id: OTHER_ID, title: 'Pazarlama', myRole: 'MEMBER' }),
      { boardId: OTHER_ID },
    );

    expect(await screen.findByRole('link', { name: 'Pazarlama' })).toHaveAttribute(
      'href',
      `/boards/${OTHER_ID}`,
    );
  });

  it.each(['membership:removed', 'board:deleted'] as const)('drops the board on %s, without a toast', async (type) => {
    await openBoardsPage();

    fakeRealtime.serverEmit(type, { boardId: BOARD_ID }, { boardId: BOARD_ID });

    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Yol haritası' })).not.toBeInTheDocument(),
    );
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it('does not create a list cache that was never loaded', async () => {
    useAuthStore.getState().setSession({ accessToken: 'token', user: testUser });
    server.use(http.get('*/api/v1/boards/:id', () => new HttpResponse(null, { status: 404 })));
    const { queryClient } = renderApp('/boards/not-listed');
    await screen.findByText(/Pano bulunamadı/);
    fakeRealtime.connect();

    fakeRealtime.serverEmit('membership:added', boardSummary(), { boardId: BOARD_ID });

    expect(queryClient.getQueryData(boardKeys.list())).toBeUndefined();
  });
});
