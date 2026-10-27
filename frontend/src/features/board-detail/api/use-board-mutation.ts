import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BoardDetailDto } from '@trello/contracts';
import { boardKeys } from '../../boards';

interface BoardMutationOptions<TVariables, TData> {
  boardId: string;
  mutationFn: (variables: TVariables) => Promise<TData>;
  /** Applied to the cached board before the request; rolled back if it fails. */
  optimistic?: (detail: BoardDetailDto, variables: TVariables) => BoardDetailDto;
  /** Applied with the server's answer. */
  onSuccessCache?: (detail: BoardDetailDto, data: TData, variables: TVariables) => BoardDetailDto;
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables) => void;
}

/**
 * Mutation on the board detail cache with the project's optimistic pattern:
 * onMutate (cancel + snapshot + update) → onError (roll back) → onSettled (refetch).
 * Refetching the board also refreshes the archived lists (same key prefix).
 */
export function useBoardMutation<TVariables, TData>({
  boardId,
  mutationFn,
  optimistic,
  onSuccessCache,
  onSuccess,
  onError,
}: BoardMutationOptions<TVariables, TData>) {
  const queryClient = useQueryClient();
  const key = boardKeys.detail(boardId);
  const update = (fn: (detail: BoardDetailDto) => BoardDetailDto) =>
    queryClient.setQueryData<BoardDetailDto>(key, (detail) => detail && fn(detail));

  return useMutation({
    mutationFn,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BoardDetailDto>(key);
      if (optimistic) update((detail) => optimistic(detail, variables));
      return { previous };
    },
    onError: (error, variables, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      onError?.(error, variables);
    },
    onSuccess: (data, variables) => {
      if (onSuccessCache) update((detail) => onSuccessCache(detail, data, variables));
      onSuccess?.(data, variables);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
