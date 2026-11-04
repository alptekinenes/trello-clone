import { useQueryClient } from '@tanstack/react-query';
import type { BoardSummaryDto } from '@trello/contracts';
import { useRealtimeEvents } from '../../../shared/hooks/use-realtime-events';
import { asUserEvent } from '../../../shared/lib/realtime-message';
import { boardKeys } from '../api/board-keys';
import { applyBoardListEvent } from '../lib/apply-board-list-event';

/**
 * Keeps the cached list of boards in step with the user's memberships:
 * added to a board, removed from one, or a board deleted. Does nothing
 * until the list has been loaded (the first load is current anyway).
 */
export function useBoardListRealtime(): void {
  const queryClient = useQueryClient();

  useRealtimeEvents((message) => {
    const event = asUserEvent(message);
    if (!event) return;
    queryClient.setQueryData<BoardSummaryDto[]>(boardKeys.list(), (boards) =>
      boards ? applyBoardListEvent(boards, event) : boards,
    );
  });
}
