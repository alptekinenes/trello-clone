import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BoardDetailDto, BoardSummaryDto, UpdateBoardRequest } from '@trello/contracts';
import { boardKeys, boardsApi } from '../../boards';

export function useBoard(boardId: string) {
  return useQuery({
    queryKey: boardKeys.detail(boardId),
    queryFn: () => boardsApi.get(boardId),
  });
}

function patchBoard(detail: BoardDetailDto | undefined, changes: Partial<BoardSummaryDto>) {
  return detail ? { ...detail, board: { ...detail.board, ...changes } } : detail;
}

/**
 * Optimistic: the change (title, background) shows at once and is rolled back if the
 * request fails. Updates of one board run one after the other (`scope`), so quick
 * successive changes (arrow keys on the background picker) reach the server in order and
 * an older answer cannot overwrite a newer one. While a newer update is queued, an older
 * one leaves the cache alone (its answer or rollback would flash an outdated board); the
 * last one to settle refetches. `onFailed` runs for every failed update, even when a newer
 * one has started (callbacks given to `mutate()` are dropped then).
 */
export function useUpdateBoard(boardId: string, onFailed?: () => void) {
  const queryClient = useQueryClient();
  const detailKey = boardKeys.detail(boardId);
  const mutationKey = ['board-update', boardId] as const;
  // This mutation still counts as running in its callbacks, so more than 1 means a newer one waits.
  const newerQueued = () => queryClient.isMutating({ mutationKey }) > 1;

  return useMutation({
    mutationKey,
    scope: { id: `board-update-${boardId}` },
    mutationFn: (changes: UpdateBoardRequest) => boardsApi.update(boardId, changes),
    onMutate: async (changes) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<BoardDetailDto>(detailKey);
      queryClient.setQueryData<BoardDetailDto>(detailKey, (detail) => patchBoard(detail, changes));
      return { previous };
    },
    onError: (_error, _changes, context) => {
      if (context?.previous && !newerQueued()) queryClient.setQueryData(detailKey, context.previous);
      onFailed?.();
    },
    onSuccess: (board) => {
      if (newerQueued()) return;
      queryClient.setQueryData<BoardDetailDto>(detailKey, (detail) => patchBoard(detail, board));
      queryClient.setQueryData<BoardSummaryDto[]>(boardKeys.list(), (boards) =>
        boards?.map((item) => (item.id === board.id ? board : item)),
      );
    },
    onSettled: () =>
      newerQueued() ? undefined : queryClient.invalidateQueries({ queryKey: boardKeys.all }),
  });
}

export function useDeleteBoard(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => boardsApi.remove(boardId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: boardKeys.detail(boardId) });
      queryClient.setQueryData<BoardSummaryDto[]>(boardKeys.list(), (boards) =>
        boards?.filter((board) => board.id !== boardId),
      );
      return queryClient.invalidateQueries({ queryKey: boardKeys.list() });
    },
  });
}
