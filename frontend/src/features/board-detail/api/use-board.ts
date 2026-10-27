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

/** Optimistic: the new title shows at once and is rolled back if the request fails. */
export function useUpdateBoard(boardId: string) {
  const queryClient = useQueryClient();
  const detailKey = boardKeys.detail(boardId);

  return useMutation({
    mutationFn: (changes: UpdateBoardRequest) => boardsApi.update(boardId, changes),
    onMutate: async (changes) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<BoardDetailDto>(detailKey);
      queryClient.setQueryData<BoardDetailDto>(detailKey, (detail) => patchBoard(detail, changes));
      return { previous };
    },
    onError: (_error, _changes, context) => {
      if (context?.previous) queryClient.setQueryData(detailKey, context.previous);
    },
    onSuccess: (board) => {
      queryClient.setQueryData<BoardDetailDto>(detailKey, (detail) => patchBoard(detail, board));
      queryClient.setQueryData<BoardSummaryDto[]>(boardKeys.list(), (boards) =>
        boards?.map((item) => (item.id === board.id ? board : item)),
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: boardKeys.all }),
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
