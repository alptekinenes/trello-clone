import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type {
  BoardDetailDto,
  BoardEvent,
  MoveListRequest,
  PositionRebalancedData,
} from '@trello/contracts';
import { delay, http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { useToastStore } from '../../../shared/store/toast-store';
import { BOARD_ID, apiError, boardDetail, testLists } from '../../../test/fixtures';
import { server } from '../../../test/msw-server';
import { createTestQueryClient } from '../../../test/render';
import { boardKeys } from '../../boards';
import { applyBoardEvent } from '../lib/apply-board-event';
import { useBoard } from './use-board';
import { useMoveList } from './use-list-mutations';

const DETAIL = boardDetail('OWNER', 'Pano', testLists('A', 'B', 'C'));
const titles = (detail: BoardDetailDto | undefined) => detail?.lists.map((l) => l.title);

function setup() {
  const queryClient = createTestQueryClient();
  // The cached board counts as fresh, so only the mutation's invalidation refetches it.
  queryClient.setQueryDefaults(boardKeys.all, { staleTime: Infinity });
  queryClient.setQueryData(boardKeys.detail(BOARD_ID), DETAIL);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  // The board page always observes the board query; without an observer nothing refetches.
  const { result } = renderHook(
    () => {
      useBoard(BOARD_ID);
      return useMoveList(BOARD_ID);
    },
    { wrapper },
  );
  const cached = () => queryClient.getQueryData<BoardDetailDto>(boardKeys.detail(BOARD_ID));
  return { result, cached };
}

const MOVE_C_FIRST = { listId: 'list-3', afterListId: null, beforeListId: 'list-1' };

describe('useMoveList', () => {
  it('reorders the cache before the server answers, then keeps the server position', async () => {
    let sent: MoveListRequest | null = null;
    server.use(
      http.post('*/api/v1/lists/list-3/move', async ({ request }) => {
        sent = (await request.json()) as MoveListRequest;
        await delay(200);
        return HttpResponse.json({ id: 'list-3', position: 500, rebalanced: null });
      }),
      http.get(`*/api/v1/boards/${BOARD_ID}`, () =>
        HttpResponse.json(boardDetail('OWNER', 'Pano', [
          { ...DETAIL.lists[2], position: 500 },
          DETAIL.lists[0],
          DETAIL.lists[1],
        ])),
      ),
    );
    const { result, cached } = setup();

    act(() => result.current.mutate(MOVE_C_FIRST));

    await waitFor(() => expect(titles(cached())).toEqual(['C', 'A', 'B']));
    // Optimistic position: halfway between the start and A (1024).
    expect(cached()?.lists[0].position).toBe(512);
    expect(sent).toEqual({ afterListId: null, beforeListId: 'list-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await waitFor(() => expect(cached()?.lists[0].position).toBe(500));
  });

  describe('with a rebalance in the answer', () => {
    // The server respread the lists: C lands at 2500, A moves out to 3000 (B stays at 2048).
    const REBALANCED = {
      id: 'list-3',
      position: 2500,
      rebalanced: { entity: 'list', positions: [{ id: 'list-1', position: 3000 }] },
    };
    const positionOf = (detail: BoardDetailDto | undefined, id: string) =>
      detail?.lists.find((list) => list.id === id)?.position;

    it('puts the list in its right place at once, without waiting for a refetch', async () => {
      server.use(
        http.post('*/api/v1/lists/list-3/move', () => HttpResponse.json(REBALANCED)),
        http.get(`*/api/v1/boards/${BOARD_ID}`, async () => {
          await delay(300);
          return HttpResponse.json(DETAIL);
        }),
      );
      const { result, cached } = setup();

      act(() => result.current.mutate({ listId: 'list-3', afterListId: 'list-1', beforeListId: null }));
      await waitFor(() => expect(positionOf(cached(), 'list-1')).toBe(3000));

      // Without the rebalance A would keep 1024 and stay in front of B and C.
      expect(titles(cached())).toEqual(['B', 'C', 'A']);
      expect(positionOf(cached(), 'list-3')).toBe(2500);
    });

    it('is right even while another move is still on its way', async () => {
      let boardFetches = 0;
      server.use(
        http.post('*/api/v1/lists/list-3/move', () => HttpResponse.json(REBALANCED)),
        http.post('*/api/v1/lists/list-2/move', async () => {
          await delay(500);
          return HttpResponse.json({ id: 'list-2', position: 2048, rebalanced: null });
        }),
        http.get(`*/api/v1/boards/${BOARD_ID}`, () => {
          boardFetches += 1;
          return HttpResponse.json(DETAIL);
        }),
      );
      const { result, cached } = setup();

      act(() => {
        result.current.mutate({ listId: 'list-2', afterListId: 'list-3', beforeListId: null });
        result.current.mutate({ listId: 'list-3', afterListId: 'list-1', beforeListId: null });
      });
      await waitFor(() => expect(positionOf(cached(), 'list-1')).toBe(3000));

      expect(boardFetches).toBe(0);
      expect(titles(cached())).toEqual(['C', 'A', 'B']);
    });

    it('is not changed again by the same rebalance arriving as a socket event', async () => {
      server.use(
        http.post('*/api/v1/lists/list-3/move', () => HttpResponse.json(REBALANCED)),
        http.get(`*/api/v1/boards/${BOARD_ID}`, async () => {
          await delay(300);
          return HttpResponse.json(DETAIL);
        }),
      );
      const { result, cached } = setup();
      act(() => result.current.mutate({ listId: 'list-3', afterListId: 'list-1', beforeListId: null }));
      await waitFor(() => expect(positionOf(cached(), 'list-1')).toBe(3000));
      const afterAnswer = cached() as BoardDetailDto;
      const echo: BoardEvent = {
        type: 'position:rebalanced',
        data: REBALANCED.rebalanced as PositionRebalancedData,
      };

      expect(applyBoardEvent(afterAnswer, echo, 'me').detail).toEqual(afterAnswer);
    });
  });

  it('keeps the other lists as they are when the answer has no rebalance', async () => {
    let answered = false;
    server.use(
      http.post('*/api/v1/lists/list-3/move', () => {
        answered = true;
        return HttpResponse.json({ id: 'list-3', position: 512, rebalanced: null });
      }),
      http.get(`*/api/v1/boards/${BOARD_ID}`, async () => {
        await delay(300);
        return HttpResponse.json(DETAIL);
      }),
    );
    const { result, cached } = setup();

    act(() => result.current.mutate(MOVE_C_FIRST));
    await waitFor(() => expect(answered).toBe(true));

    expect(titles(cached())).toEqual(['C', 'A', 'B']);
    expect(cached()?.lists.slice(1)).toEqual(DETAIL.lists.slice(0, 2));
  });

  it('rolls back and shows an error when the move fails', async () => {
    server.use(
      http.post('*/api/v1/lists/list-3/move', async () => {
        await delay(200);
        return apiError(500, 'INTERNAL_ERROR');
      }),
      http.get(`*/api/v1/boards/${BOARD_ID}`, () => HttpResponse.json(DETAIL)),
    );
    const { result, cached } = setup();

    act(() => result.current.mutate(MOVE_C_FIRST));
    await waitFor(() => expect(titles(cached())).toEqual(['C', 'A', 'B']));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(titles(cached())).toEqual(['A', 'B', 'C']);
    expect(useToastStore.getState().toasts.at(-1)).toMatchObject({
      tone: 'error',
      message: 'Liste taşınamadı. Tekrar dene.',
    });
  });

  it('reloads the board on a 409 and says why', async () => {
    let boardFetches = 0;
    server.use(
      http.post('*/api/v1/lists/list-3/move', () => apiError(409, 'POSITION_CONFLICT')),
      http.get(`*/api/v1/boards/${BOARD_ID}`, () => {
        boardFetches += 1;
        return HttpResponse.json(boardDetail('OWNER', 'Pano', testLists('B', 'A', 'C')));
      }),
    );
    const { result, cached } = setup();

    act(() => result.current.mutate(MOVE_C_FIRST));

    await waitFor(() => expect(result.current.isError).toBe(true));
    await waitFor(() => expect(boardFetches).toBe(1));
    await waitFor(() => expect(titles(cached())).toEqual(['B', 'A', 'C']));
    expect(useToastStore.getState().toasts.at(-1)?.message).toMatch(/başka biri tarafından/);
  });
});
