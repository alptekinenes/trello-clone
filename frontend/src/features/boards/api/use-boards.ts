import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BoardSummaryDto } from '@trello/contracts';
import { boardKeys } from './board-keys';
import { boardsApi } from './boards-api';

/** Boards the current user is a member of. */
export function useBoards() {
  return useQuery({ queryKey: boardKeys.list(), queryFn: boardsApi.list });
}

export function useCreateBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: boardsApi.create,
    onSuccess: (board) => {
      queryClient.setQueryData<BoardSummaryDto[]>(boardKeys.list(), (boards) =>
        boards ? [board, ...boards] : boards,
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: boardKeys.list() }),
  });
}
