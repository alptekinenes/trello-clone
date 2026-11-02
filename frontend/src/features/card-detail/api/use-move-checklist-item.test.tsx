import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { CardDetailDto, ChecklistItemDto } from '@trello/contracts';
import { delay, http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  BOARD_ID,
  apiError,
  boardDetail,
  testCard,
  testCardDetail,
  testLists,
} from '../../../test/fixtures';
import { server } from '../../../test/msw-server';
import { createTestQueryClient } from '../../../test/render';
import { useBoard } from '../../board-detail';
import { boardKeys } from '../../boards';
import { withCounters } from '../lib/card-detail-cache';
import { useCardDetailStore } from '../store/card-detail-store';
import { cardKeys } from './card-keys';
import { useCardDetail } from './use-card-detail';
import { useMoveChecklistItem } from './use-checklist-mutations';

const [TODO] = testLists('Yapılacaklar');

function item(id: string, checklistId: string, position: number): ChecklistItemDto {
  return { id, checklistId, content: id, isCompleted: false, position };
}

const CARD: CardDetailDto = withCounters(
  testCardDetail({
    id: 'card-1',
    listId: TODO.id,
    title: 'Rapor',
    checklists: [
      {
        id: 'a',
        cardId: 'card-1',
        title: 'A',
        position: 1024,
        items: [item('a1', 'a', 1024), item('a2', 'a', 2048)],
      },
      { id: 'b', cardId: 'card-1', title: 'B', position: 2048, items: [item('b1', 'b', 1024)] },
    ],
  }),
);

async function setup(onRollback?: () => void) {
  // The card's dialog is open, so failures show inside it.
  useCardDetailStore.getState().open('card-1');
  const queryClient = createTestQueryClient();
  queryClient.setQueryDefaults(boardKeys.all, { staleTime: Infinity });
  queryClient.setQueryData(
    boardKeys.detail(BOARD_ID),
    boardDetail('OWNER', 'Pano', [TODO], [testCard(CARD)]),
  );
  queryClient.setQueryData(cardKeys.detail(BOARD_ID, CARD.id), CARD);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () => {
      useBoard(BOARD_ID);
      // The dialog always observes its card; without an observer nothing refetches.
      const detail = useCardDetail(BOARD_ID, CARD.id);
      return { detail, move: useMoveChecklistItem(BOARD_ID, CARD.id, { onRollback }) };
    },
    { wrapper },
  );
  await waitFor(() => expect(result.current.detail.isFetching).toBe(false));
  const card = () => queryClient.getQueryData<CardDetailDto>(cardKeys.detail(BOARD_ID, CARD.id));
  const ids = (checklistId: string) =>
    card()
      ?.checklists.find((list) => list.id === checklistId)
      ?.items.map((i) => i.id);
  return { result, card, ids };
}

const refetchHandlers = (counter: { card: number }) => [
  http.get(`*/api/v1/boards/${BOARD_ID}`, () =>
    HttpResponse.json(boardDetail('OWNER', 'Pano', [TODO], [testCard(CARD)])),
  ),
  http.get(`*/api/v1/cards/${CARD.id}`, () => {
    counter.card += 1;
    return HttpResponse.json(CARD);
  }),
];

describe('useMoveChecklistItem', () => {
  it('moves the item to another checklist before the server answers, between its neighbours', async () => {
    server.use(
      http.post('*/api/v1/checklist-items/a1/move', async () => {
        await delay(60);
        return HttpResponse.json({ id: 'a1', checklistId: 'b', position: 1536 });
      }),
      ...refetchHandlers({ card: 0 }),
    );
    const { result, ids, card } = await setup();

    act(() =>
      result.current.move.mutate({ itemId: 'a1', checklistId: 'b', afterItemId: 'b1', beforeItemId: null }),
    );

    await waitFor(() => expect(ids('b')).toEqual(['b1', 'a1']));
    expect(ids('a')).toEqual(['a2']);
    expect(card()?.checklists[1].items[1].position).toBe(2048);
    expect(card()).toMatchObject({ checklistTotal: 3, checklistDone: 0 });
    await waitFor(() => expect(result.current.move.isSuccess).toBe(true));
  });

  it('puts the item back and tells the dialog when the move fails', async () => {
    const onRollback = vi.fn();
    server.use(
      http.post('*/api/v1/checklist-items/a1/move', async () => {
        await delay(60);
        return apiError(500, 'INTERNAL_ERROR');
      }),
      ...refetchHandlers({ card: 0 }),
    );
    const { result, ids } = await setup(onRollback);

    act(() =>
      result.current.move.mutate({ itemId: 'a1', checklistId: 'b', afterItemId: null, beforeItemId: 'b1' }),
    );
    await waitFor(() => expect(ids('b')).toEqual(['a1', 'b1']));
    await waitFor(() => expect(result.current.move.isError).toBe(true));

    expect(ids('a')).toEqual(['a1', 'a2']);
    expect(ids('b')).toEqual(['b1']);
    expect(onRollback).toHaveBeenCalledOnce();
    expect(useCardDetailStore.getState().error?.message).toBe('Öğe taşınamadı. Tekrar dene.');
  });

  it('refetches the card after a conflict', async () => {
    const counter = { card: 0 };
    server.use(
      http.post('*/api/v1/checklist-items/a1/move', () => apiError(409, 'POSITION_CONFLICT')),
      ...refetchHandlers(counter),
    );
    const { result } = await setup();
    counter.card = 0;

    act(() =>
      result.current.move.mutate({ itemId: 'a1', checklistId: 'a', afterItemId: 'a2', beforeItemId: null }),
    );

    await waitFor(() => expect(counter.card).toBe(1));
    expect(useCardDetailStore.getState().error?.message).toBe(
      'Öğeler başka biri tarafından değiştirildi. Kart yenilendi.',
    );
  });
});
