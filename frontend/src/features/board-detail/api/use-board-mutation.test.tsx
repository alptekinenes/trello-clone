import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { BoardDetailDto } from '@trello/contracts';
import { delay, http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BOARD_ID, apiError, boardDetail, testCards, testLists } from '../../../test/fixtures';
import { server } from '../../../test/msw-server';
import { createTestQueryClient } from '../../../test/render';
import { boardKeys } from '../../boards';
import { patchCard } from '../lib/board-cache';
import { useBoard } from './use-board';
import { useBoardMutation } from './use-board-mutation';

const [TODO] = testLists('Yapılacaklar');
const DETAIL = boardDetail('OWNER', 'Pano', [TODO], testCards(TODO.id, 'A', 'B'));

/** Renames a card through a fake endpoint that answers after `ms`, or fails. */
function setup({ onRollback }: { onRollback?: (title: string) => void } = {}) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryDefaults(boardKeys.all, { staleTime: Infinity });
  queryClient.setQueryData(boardKeys.detail(BOARD_ID), DETAIL);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () => {
      useBoard(BOARD_ID);
      return useBoardMutation({
        boardId: BOARD_ID,
        mutationFn: async ({ ms, fail }: { cardId: string; title: string; ms: number; fail?: boolean }) => {
          const res = await fetch(`http://localhost/rename?ms=${ms}&fail=${fail ? 1 : 0}`);
          if (!res.ok) throw new Error('failed');
          return null;
        },
        optimistic: (detail, { cardId, title }) => patchCard(detail, cardId, { title }),
        onRollback: ({ title }) => onRollback?.(title),
      });
    },
    { wrapper },
  );
  const cached = () => queryClient.getQueryData<BoardDetailDto>(boardKeys.detail(BOARD_ID));
  return { result, cached };
}

describe('useBoardMutation', () => {
  it('refetches the board once, after the last of overlapping mutations', async () => {
    let boardFetches = 0;
    server.use(
      http.get('http://localhost/rename', async ({ request }) => {
        await delay(Number(new URL(request.url).searchParams.get('ms')));
        return HttpResponse.json(null);
      }),
      http.get(`*/api/v1/boards/${BOARD_ID}`, () => {
        boardFetches += 1;
        return HttpResponse.json(DETAIL);
      }),
    );
    const { result, cached } = setup();
    const [a, b] = DETAIL.cards;

    act(() => result.current.mutate({ cardId: a.id, title: 'A2', ms: 50 }));
    act(() => result.current.mutate({ cardId: b.id, title: 'B2', ms: 200 }));

    // A settles first: its refetch would wipe B's optimistic title, so it waits.
    await delay(120);
    expect(boardFetches).toBe(0);
    expect(cached()?.cards.map((card) => card.title)).toEqual(['A2', 'B2']);

    await waitFor(() => expect(boardFetches).toBe(1));
  });

  it('reports a rollback right after the cache is restored', async () => {
    server.use(
      http.get('http://localhost/rename', () => apiError(500, 'INTERNAL_ERROR')),
      http.get(`*/api/v1/boards/${BOARD_ID}`, () => HttpResponse.json(DETAIL)),
    );
    const onRollback = vi.fn();
    const { result, cached } = setup({ onRollback });

    act(() => result.current.mutate({ cardId: DETAIL.cards[0].id, title: 'A2', ms: 0, fail: true }));

    await waitFor(() => expect(onRollback).toHaveBeenCalledWith('A2'));
    expect(cached()?.cards[0].title).toBe('A');
  });
});
