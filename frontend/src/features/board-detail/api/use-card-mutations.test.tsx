import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { BoardDetailDto, CardSummaryDto, MoveCardRequest } from '@trello/contracts';
import { delay, http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useToastStore } from '../../../shared/store/toast-store';
import { BOARD_ID, apiError, boardDetail, testCards, testLists } from '../../../test/fixtures';
import { server } from '../../../test/msw-server';
import { createTestQueryClient } from '../../../test/render';
import { boardKeys } from '../../boards';
import { useBoard } from './use-board';
import { type MoveCardVariables, useMoveCard } from './use-card-mutations';

const [TODO, DONE] = testLists('Yapılacaklar', 'Bitti');
const CARDS = [...testCards(TODO.id, 'A', 'B'), ...testCards(DONE.id, 'C')];
const DETAIL = boardDetail('OWNER', 'Pano', [TODO, DONE], CARDS);
const [A, B, C] = CARDS;

/** Card titles per list, in position order. */
function columns(detail: BoardDetailDto | undefined) {
  const titles = (listId: string) =>
    (detail?.cards ?? []).filter((card) => card.listId === listId).map((card) => card.title);
  return { todo: titles(TODO.id), done: titles(DONE.id) };
}

function setup(onMoved?: (card: CardSummaryDto) => void) {
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
      return useMoveCard(BOARD_ID, { onMoved });
    },
    { wrapper },
  );
  const cached = () => queryClient.getQueryData<BoardDetailDto>(boardKeys.detail(BOARD_ID));
  return { result, cached };
}

/** A to the top of "Bitti", before C. */
const MOVE_A: MoveCardVariables = {
  cardId: A.id,
  listId: DONE.id,
  afterCardId: null,
  beforeCardId: C.id,
};

describe('useMoveCard', () => {
  it('moves the card in the cache before the server answers, then keeps the server position', async () => {
    let sent: MoveCardRequest | null = null;
    server.use(
      http.post(`*/api/v1/cards/${A.id}/move`, async ({ request }) => {
        sent = (await request.json()) as MoveCardRequest;
        await delay(200);
        return HttpResponse.json({ id: A.id, listId: DONE.id, position: 500 });
      }),
      http.get(`*/api/v1/boards/${BOARD_ID}`, () =>
        HttpResponse.json({
          ...DETAIL,
          cards: [{ ...A, listId: DONE.id, position: 500 }, B, C],
        }),
      ),
    );
    const onMoved = vi.fn();
    const { result, cached } = setup(onMoved);

    act(() => result.current.mutate(MOVE_A));

    await waitFor(() => expect(columns(cached())).toEqual({ todo: ['B'], done: ['A', 'C'] }));
    // Optimistic position: halfway between the top and C (1024).
    expect(cached()?.cards.find((card) => card.id === A.id)?.position).toBe(512);
    expect(onMoved).toHaveBeenCalledWith(
      expect.objectContaining({ id: A.id, listId: DONE.id, position: 512 }),
    );
    expect(sent).toEqual({ listId: DONE.id, afterCardId: null, beforeCardId: C.id });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await waitFor(() =>
      expect(cached()?.cards.find((card) => card.id === A.id)?.position).toBe(500),
    );
  });

  it('rolls back and shows an error when the move fails', async () => {
    server.use(
      http.post(`*/api/v1/cards/${A.id}/move`, async () => {
        await delay(200);
        return apiError(500, 'INTERNAL_ERROR');
      }),
      http.get(`*/api/v1/boards/${BOARD_ID}`, () => HttpResponse.json(DETAIL)),
    );
    const { result, cached } = setup();

    act(() => result.current.mutate(MOVE_A));
    await waitFor(() => expect(columns(cached()).done).toEqual(['A', 'C']));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(columns(cached())).toEqual({ todo: ['A', 'B'], done: ['C'] });
    expect(useToastStore.getState().toasts.at(-1)).toMatchObject({
      tone: 'error',
      message: 'Kart taşınamadı. Tekrar dene.',
    });
  });

  it.each([
    [409, 'POSITION_CONFLICT'],
    [400, 'INVALID_TARGET'],
  ] as const)('reloads the board on %i %s and says why', async (status, code) => {
    let boardFetches = 0;
    server.use(
      http.post(`*/api/v1/cards/${A.id}/move`, () => apiError(status, code)),
      http.get(`*/api/v1/boards/${BOARD_ID}`, () => {
        boardFetches += 1;
        return HttpResponse.json({ ...DETAIL, cards: [B, A, C] });
      }),
    );
    const { result } = setup();

    act(() => result.current.mutate(MOVE_A));

    await waitFor(() => expect(result.current.isError).toBe(true));
    await waitFor(() => expect(boardFetches).toBe(1));
    expect(useToastStore.getState().toasts.at(-1)?.message).toMatch(/başka biri tarafından/);
  });
});
