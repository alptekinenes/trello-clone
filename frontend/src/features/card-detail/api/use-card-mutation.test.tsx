import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { BoardDetailDto, CardDetailDto } from '@trello/contracts';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import {
  BOARD_ID,
  apiError,
  boardDetail,
  testCard,
  testCardDetail,
  testLists,
} from '../../../test/fixtures';
import { server } from '../../../test/msw-server';
import { gate, waitForMutationSuccess } from '../../../test/gate';
import { createTestQueryClient } from '../../../test/render';
import { boardKeys } from '../../boards';
import { useBoard } from '../../board-detail';
import { CONFLICT_MESSAGE } from '../../../shared/lib/api-error-message';
import { useCardDetailStore } from '../store/card-detail-store';
import { cardKeys } from './card-keys';
import { useUpdateCard } from './use-card-mutations';

const [TODO, DONE] = testLists('Yapılacaklar', 'Bitti');
const CARD = testCardDetail({ id: 'card-1', listId: TODO.id, title: 'Rapor' });
const OTHER = testCard({ id: 'card-2', listId: TODO.id, title: 'Diğer', position: 2048 });
const BOARD = boardDetail('OWNER', 'Pano', [TODO, DONE], [testCard(CARD), OTHER]);

function setup() {
  // The card's dialog is open, so failures show inside it.
  useCardDetailStore.getState().open('card-1');
  const queryClient = createTestQueryClient();
  queryClient.setQueryDefaults(boardKeys.all, { staleTime: Infinity });
  queryClient.setQueryData(boardKeys.detail(BOARD_ID), BOARD);
  queryClient.setQueryData(cardKeys.detail(BOARD_ID, CARD.id), CARD);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () => {
      useBoard(BOARD_ID);
      return useUpdateCard(BOARD_ID, CARD.id);
    },
    { wrapper },
  );
  return {
    result,
    queryClient,
    board: () => queryClient.getQueryData<BoardDetailDto>(boardKeys.detail(BOARD_ID)),
    card: () => queryClient.getQueryData<CardDetailDto>(cardKeys.detail(BOARD_ID, CARD.id)),
  };
}

const tileOf = (board: BoardDetailDto | undefined, id: string) =>
  board?.cards.find((card) => card.id === id);

describe('useUpdateCard', () => {
  it('copies the change to the card and to its tile before the server answers', async () => {
    const answer = gate();
    server.use(
      http.patch(`*/api/v1/cards/${CARD.id}`, async () => {
        await answer.opened;
        return HttpResponse.json(testCard({ ...CARD, title: 'Yeni' }));
      }),
      http.get(`*/api/v1/boards/${BOARD_ID}`, () => HttpResponse.json(BOARD)),
      http.get(`*/api/v1/cards/${CARD.id}`, () => HttpResponse.json(CARD)),
    );
    const { result, card, board } = setup();

    act(() => result.current.mutate({ title: 'Yeni', description: '  Açıklama  ' }));

    await waitFor(() => expect(card()?.title).toBe('Yeni'));
    expect(card()?.description).toBe('Açıklama');
    expect(tileOf(board(), CARD.id)).toMatchObject({ title: 'Yeni', hasDescription: true });
    expect(result.current.isPending).toBe(true);

    answer.release();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('clears the completion with the due date', async () => {
    server.use(
      http.patch(`*/api/v1/cards/${CARD.id}`, () => new Promise(() => undefined)),
    );
    const { result, card, queryClient } = setup();
    queryClient.setQueryData(
      cardKeys.detail(BOARD_ID, CARD.id),
      testCardDetail({ ...CARD, dueDate: '2026-11-05T10:00:00.000Z', dueComplete: true }),
    );

    act(() => result.current.mutate({ dueDate: null }));

    await waitFor(() => expect(card()).toMatchObject({ dueDate: null, dueComplete: false }));
  });

  it('on failure restores only this card and shows the error, leaving the rest of the board alone', async () => {
    const answer = gate();
    server.use(
      http.patch(`*/api/v1/cards/${CARD.id}`, async () => {
        await answer.opened;
        return apiError(500, 'INTERNAL_ERROR');
      }),
      // The server already has the other change, so the refetch after the failure keeps it.
      http.get(`*/api/v1/boards/${BOARD_ID}`, () =>
        HttpResponse.json({
          ...BOARD,
          cards: [testCard(CARD), { ...OTHER, title: 'Başka biri' }],
        }),
      ),
      http.get(`*/api/v1/cards/${CARD.id}`, () => HttpResponse.json(CARD)),
    );
    const { result, card, board, queryClient } = setup();

    act(() => result.current.mutate({ title: 'Yeni' }));
    await waitFor(() => expect(card()?.title).toBe('Yeni'));
    // Another change to the board arrives while the request is on its way.
    queryClient.setQueryData<BoardDetailDto>(boardKeys.detail(BOARD_ID), (detail) =>
      detail && { ...detail, cards: detail.cards.map((c) => (c.id === OTHER.id ? { ...c, title: 'Başka biri' } : c)) },
    );

    answer.release();
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(card()?.title).toBe('Rapor');
    expect(tileOf(board(), CARD.id)?.title).toBe('Rapor');
    expect(tileOf(board(), OTHER.id)?.title).toBe('Başka biri');
    expect(useCardDetailStore.getState().error?.message).toBe('Değişiklik kaydedilemedi. Tekrar dene.');
  });

  it('answers a conflict with the conflict text inside the dialog and reloads the card', async () => {
    let boardFetches = 0;
    server.use(
      http.patch(`*/api/v1/cards/${CARD.id}`, () => apiError(409, 'CONFLICT')),
      http.get(`*/api/v1/boards/${BOARD_ID}`, () => {
        boardFetches += 1;
        return HttpResponse.json(BOARD);
      }),
      http.get(`*/api/v1/cards/${CARD.id}`, () => HttpResponse.json(CARD)),
    );
    const { result, card } = setup();

    act(() => result.current.mutate({ title: 'Yeni' }));

    await waitFor(() => expect(boardFetches).toBe(1));
    expect(card()?.title).toBe('Rapor');
    expect(useCardDetailStore.getState().error?.message).toBe(CONFLICT_MESSAGE);
  });

  it('refetches the board only after the last of overlapping mutations', async () => {
    let boardFetches = 0;
    const answer = { A: gate(), B: gate() };
    server.use(
      http.patch(`*/api/v1/cards/${CARD.id}`, async ({ request }) => {
        const body = (await request.json()) as { title: 'A' | 'B' };
        await answer[body.title].opened;
        return HttpResponse.json(testCard({ ...CARD, title: body.title ?? CARD.title }));
      }),
      http.get(`*/api/v1/boards/${BOARD_ID}`, () => {
        boardFetches += 1;
        return HttpResponse.json(BOARD);
      }),
      http.get(`*/api/v1/cards/${CARD.id}`, () => HttpResponse.json(CARD)),
    );
    const { result, queryClient } = setup();

    act(() => result.current.mutate({ title: 'A' }));
    act(() => result.current.mutate({ title: 'B' }));

    // A has settled while B is still on its way.
    answer.A.release();
    await waitForMutationSuccess(queryClient, (variables) => (variables as { title?: string }).title === 'A');
    expect(boardFetches).toBe(0);

    answer.B.release();
    await waitFor(() => expect(boardFetches).toBe(1));
  });
});
