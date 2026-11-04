import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  BOARD_ID,
  apiError,
  boardDetail,
  testCards,
  testLists,
} from '../../../test/fixtures';
import { server } from '../../../test/msw-server';
import { createTestQueryClient } from '../../../test/render';
import { boardKeys } from '../../boards';
import { useMoveCard } from './use-card-mutations';
import { useBoard } from './use-board';
import { useMoveList } from './use-list-mutations';

const LISTS = testLists('A', 'B', 'C');
const DETAIL = boardDetail('OWNER', 'Pano', LISTS, testCards('list-1', 'Bir', 'İki'));

function wrapperFor() {
  const queryClient = createTestQueryClient();
  queryClient.setQueryDefaults(boardKeys.all, { staleTime: Infinity });
  queryClient.setQueryData(boardKeys.detail(BOARD_ID), DETAIL);
  server.use(http.get(`*/api/v1/boards/${BOARD_ID}`, () => HttpResponse.json(DETAIL)));
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useMoveList callbacks (used to release held realtime events)', () => {
  it('calls onMoved once the optimistic move is in the cache, not onRollback', async () => {
    server.use(
      http.post('*/api/v1/lists/list-3/move', async () => {
        await delay(20);
        return HttpResponse.json({ id: 'list-3', position: 500, rebalanced: null });
      }),
    );
    const onMoved = vi.fn();
    const onRollback = vi.fn();
    const { result } = renderHook(
      () => {
        useBoard(BOARD_ID);
        return useMoveList(BOARD_ID, { onMoved, onRollback });
      },
      { wrapper: wrapperFor() },
    );

    act(() => result.current.mutate({ listId: 'list-3', afterListId: null, beforeListId: 'list-1' }));

    await waitFor(() => expect(onMoved).toHaveBeenCalledOnce());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(onRollback).not.toHaveBeenCalled();
  });

  it('calls onRollback when the move fails', async () => {
    server.use(http.post('*/api/v1/lists/list-3/move', () => apiError(500, 'INTERNAL_ERROR')));
    const onRollback = vi.fn();
    const { result } = renderHook(
      () => {
        useBoard(BOARD_ID);
        return useMoveList(BOARD_ID, { onRollback });
      },
      { wrapper: wrapperFor() },
    );

    act(() => result.current.mutate({ listId: 'list-3', afterListId: null, beforeListId: 'list-1' }));

    await waitFor(() => expect(onRollback).toHaveBeenCalledOnce());
  });
});

describe('useMoveCard callbacks (used to release held realtime events)', () => {
  const MOVE = { cardId: 'list-1-card-1', listId: 'list-2', afterCardId: null, beforeCardId: null };

  it('calls onMoved with the card as placed by the optimistic move', async () => {
    server.use(
      http.post('*/api/v1/cards/list-1-card-1/move', () =>
        HttpResponse.json({ id: 'list-1-card-1', listId: 'list-2', position: 1024, rebalanced: null }),
      ),
    );
    const onMoved = vi.fn();
    const { result } = renderHook(
      () => {
        useBoard(BOARD_ID);
        return useMoveCard(BOARD_ID, { onMoved });
      },
      { wrapper: wrapperFor() },
    );

    act(() => result.current.mutate(MOVE));

    await waitFor(() => expect(onMoved).toHaveBeenCalledOnce());
    expect(onMoved.mock.calls[0]?.[0]).toMatchObject({ id: 'list-1-card-1', listId: 'list-2' });
  });

  it('calls onRollback with the restored card when the move fails', async () => {
    server.use(http.post('*/api/v1/cards/list-1-card-1/move', () => apiError(500, 'INTERNAL_ERROR')));
    const onRollback = vi.fn();
    const { result } = renderHook(
      () => {
        useBoard(BOARD_ID);
        return useMoveCard(BOARD_ID, { onRollback });
      },
      { wrapper: wrapperFor() },
    );

    act(() => result.current.mutate(MOVE));

    await waitFor(() => expect(onRollback).toHaveBeenCalledOnce());
    expect(onRollback.mock.calls[0]?.[0]).toMatchObject({ id: 'list-1-card-1', listId: 'list-1' });
  });
});
