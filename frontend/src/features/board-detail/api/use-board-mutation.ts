import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BoardDetailDto } from '@trello/contracts';
import { CONFLICT_MESSAGE, isStaleConflict } from '../../../shared/lib/api-error-message';
import { showToast } from '../../../shared/store/toast-store';
import { boardKeys } from '../../boards';

/** Shared by every mutation on one board's cache, so they can tell whether others still run. */
export const boardMutationKey = (boardId: string) => ['board-mutation', boardId] as const;

interface BoardMutationOptions<TVariables, TData> {
  boardId: string;
  mutationFn: (variables: TVariables) => Promise<TData>;
  /** Applied to the cached board before the request; rolled back if it fails. */
  optimistic?: (detail: BoardDetailDto, variables: TVariables) => BoardDetailDto;
  /**
   * Runs right after the optimistic change is in the cache, with the changed board.
   * Observers hear about it a tick later, so React state set here renders first.
   */
  onOptimistic?: (variables: TVariables, detail: BoardDetailDto | undefined) => void;
  /** Runs right after a failed request's optimistic change was rolled back, with the restored board. */
  onRollback?: (variables: TVariables, detail: BoardDetailDto | undefined) => void;
  /** Applied with the server's answer. */
  onSuccessCache?: (detail: BoardDetailDto, data: TData, variables: TVariables) => BoardDetailDto;
  onSuccess?: (data: TData, variables: TVariables) => void;
  /** Runs for every failure except a conflict, which the hook answers itself (see `conflictMessage`). */
  onError?: (error: Error, variables: TVariables) => void;
  /** Toast text for a conflict (someone else changed the board first); default: the generic one. */
  conflictMessage?: string;
  /** Where the conflict text goes; default: an error toast (a modal dialog needs its own place). */
  notifyConflict?: (message: string) => void;
}

const toastError = (message: string) => showToast(message, { tone: 'error' });

/**
 * Mutation on the board detail cache with the project's optimistic pattern:
 * onMutate (cancel + snapshot + update) → onError (roll back) → onSettled (refetch).
 * Only the last running mutation of the board refetches it, so a refetch never
 * wipes out the optimistic change of a mutation that is still on its way.
 * Refetching the board also refreshes the archive queries (same key prefix).
 * A conflict (409) is handled here for every caller: the change is rolled back, the board is
 * refetched when this settles, and one toast says what happened; `onError` is skipped.
 */
export function useBoardMutation<TVariables, TData>({
  boardId,
  mutationFn,
  optimistic,
  onOptimistic,
  onRollback,
  onSuccessCache,
  onSuccess,
  onError,
  conflictMessage = CONFLICT_MESSAGE,
  notifyConflict = toastError,
}: BoardMutationOptions<TVariables, TData>) {
  const queryClient = useQueryClient();
  const key = boardKeys.detail(boardId);
  const mutationKey = boardMutationKey(boardId);
  const update = (fn: (detail: BoardDetailDto) => BoardDetailDto) =>
    queryClient.setQueryData<BoardDetailDto>(key, (detail) => detail && fn(detail));

  return useMutation({
    mutationKey,
    mutationFn,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BoardDetailDto>(key);
      if (optimistic) update((detail) => optimistic(detail, variables));
      onOptimistic?.(variables, queryClient.getQueryData<BoardDetailDto>(key));
      return { previous };
    },
    onError: (error, variables, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      onRollback?.(variables, context?.previous);
      if (isStaleConflict(error)) notifyConflict(conflictMessage);
      else onError?.(error, variables);
    },
    onSuccess: (data, variables) => {
      if (onSuccessCache) update((detail) => onSuccessCache(detail, data, variables));
      onSuccess?.(data, variables);
    },
    // This mutation still counts as running here, so 1 means "the last one".
    onSettled: () =>
      queryClient.isMutating({ mutationKey }) === 1
        ? queryClient.invalidateQueries({ queryKey: key })
        : undefined,
  });
}
