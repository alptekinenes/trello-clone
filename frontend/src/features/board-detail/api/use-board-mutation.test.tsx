import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { BoardDetailDto, ErrorCode } from '@trello/contracts';
import { delay, http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BOARD_ID, apiError, boardDetail, testCards, testLists } from '../../../test/fixtures';
import { server } from '../../../test/msw-server';
import { createTestQueryClient } from '../../../test/render';
import { boardKeys } from '../../boards';
import { ApiError } from '../../../shared/lib/http';
import { CONFLICT_MESSAGE } from '../../../shared/lib/api-error-message';
import { useToastStore } from '../../../shared/store/toast-store';
import { patchCard } from '../lib/board-cache';
import { useBoard } from './use-board';
import { useBoardMutation } from './use-board-mutation';

const [TODO] = testLists('Yapılacaklar');
const DETAIL = boardDetail('OWNER', 'Pano', [TODO], testCards(TODO.id, 'A', 'B'));

/** Renames a card through a fake endpoint that answers after `ms`, or fails. */
function setup({
  onRollback,
  onError,
  conflictMessage,
}: {
  onRollback?: (title: string) => void;
  onError?: () => void;
  conflictMessage?: string;
} = {}) {
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
          if (!res.ok) throw new ApiError(res.status, await res.json());
          return null;
        },
        optimistic: (detail, { cardId, title }) => patchCard(detail, cardId, { title }),
        onRollback: ({ title }) => onRollback?.(title),
        onError,
        conflictMessage,
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

  describe('conflicts (409)', () => {
    const failWith = (status: number, code: ErrorCode) => {
      let boardFetches = 0;
      server.use(
        http.get('http://localhost/rename', () => apiError(status, code)),
        http.get(`*/api/v1/boards/${BOARD_ID}`, () => {
          boardFetches += 1;
          return HttpResponse.json(DETAIL);
        }),
      );
      return () => boardFetches;
    };
    const rename = (result: ReturnType<typeof setup>['result']) =>
      act(() => result.current.mutate({ cardId: DETAIL.cards[0].id, title: 'A2', ms: 0, fail: true }));
    const lastToast = () => useToastStore.getState().toasts.at(-1);

    it('rolls back, reloads the board and tells the user once, in one place', async () => {
      const boardFetches = failWith(409, 'POSITION_CONFLICT');
      const onError = vi.fn();
      const { result, cached } = setup({ onError });

      rename(result);

      await waitFor(() => expect(boardFetches()).toBe(1));
      expect(cached()?.cards[0].title).toBe('A');
      expect(useToastStore.getState().toasts).toHaveLength(1);
      expect(lastToast()).toMatchObject({ tone: 'error', message: CONFLICT_MESSAGE });
      expect(onError).not.toHaveBeenCalled();
    });

    it("uses the hook's own conflict text when it gives one", async () => {
      const boardFetches = failWith(409, 'CONFLICT');
      const { result } = setup({ conflictMessage: 'Kartlar değişti.' });

      rename(result);

      await waitFor(() => expect(boardFetches()).toBe(1));
      expect(lastToast()?.message).toBe('Kartlar değişti.');
    });

    it('leaves every other failure to the hook', async () => {
      failWith(409, 'ALREADY_MEMBER');
      const onError = vi.fn();
      const { result } = setup({ onError });

      rename(result);

      await waitFor(() => expect(onError).toHaveBeenCalledOnce());
      expect(useToastStore.getState().toasts).toEqual([]);
    });
  });
});
