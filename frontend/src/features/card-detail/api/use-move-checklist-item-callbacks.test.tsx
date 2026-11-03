import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { CardDetailDto, ChecklistItemDto } from '@trello/contracts';
import { http, HttpResponse } from 'msw';
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
      { id: 'a', cardId: 'card-1', title: 'A', position: 1024, items: [item('a1', 'a', 1024)] },
      { id: 'b', cardId: 'card-1', title: 'B', position: 2048, items: [item('b1', 'b', 1024)] },
    ],
  }),
);

function setup(options: { onMoved?: () => void; onRollback?: () => void }) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryDefaults(boardKeys.all, { staleTime: Infinity });
  queryClient.setQueryData(boardKeys.detail(BOARD_ID), boardDetail('OWNER', 'Pano', [TODO], [testCard(CARD)]));
  queryClient.setQueryData(cardKeys.detail(BOARD_ID, CARD.id), CARD);
  server.use(
    http.get(`*/api/v1/boards/${BOARD_ID}`, () =>
      HttpResponse.json(boardDetail('OWNER', 'Pano', [TODO], [testCard(CARD)])),
    ),
    http.get(`*/api/v1/cards/${CARD.id}`, () => HttpResponse.json(CARD)),
  );
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(
    () => {
      useBoard(BOARD_ID);
      useCardDetail(BOARD_ID, CARD.id);
      return useMoveChecklistItem(BOARD_ID, CARD.id, options);
    },
    { wrapper },
  );
}

const MOVE = { itemId: 'a1', checklistId: 'b', afterItemId: 'b1', beforeItemId: null };

describe('useMoveChecklistItem callbacks (used to release held realtime events)', () => {
  it('calls onMoved once the optimistic move is in the cache, and not onRollback', async () => {
    server.use(
      http.post('*/api/v1/checklist-items/a1/move', () =>
        HttpResponse.json({ id: 'a1', checklistId: 'b', position: 2048 }),
      ),
    );
    const onMoved = vi.fn();
    const onRollback = vi.fn();
    const { result } = setup({ onMoved, onRollback });

    act(() => result.current.mutate(MOVE));

    await waitFor(() => expect(onMoved).toHaveBeenCalledOnce());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(onRollback).not.toHaveBeenCalled();
  });

  it('calls onRollback when the move fails', async () => {
    server.use(http.post('*/api/v1/checklist-items/a1/move', () => apiError(500, 'INTERNAL_ERROR')));
    const onRollback = vi.fn();
    const { result } = setup({ onRollback });

    act(() => result.current.mutate(MOVE));

    await waitFor(() => expect(onRollback).toHaveBeenCalledOnce());
  });
});
