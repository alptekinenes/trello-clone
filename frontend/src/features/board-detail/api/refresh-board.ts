import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { boardMutationKey } from './use-board-mutation';

/**
 * Refetches `queryKey` (the board detail or a query under it) because of a
 * realtime event. Does nothing while a mutation of the board runs: a refetch
 * now would wipe out its optimistic change, and the last mutation's own
 * refetch, which comes after the server wrote, includes the event anyway.
 */
export function refreshUnlessMutating(
  queryClient: QueryClient,
  boardId: string,
  queryKey: QueryKey,
  { exact = false }: { exact?: boolean } = {},
): void {
  if (queryClient.isMutating({ mutationKey: boardMutationKey(boardId) }) > 0) return;
  void queryClient.invalidateQueries({ queryKey, exact });
}
