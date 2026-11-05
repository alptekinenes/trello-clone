import type { BoardSummaryDto, UserEvent } from '@trello/contracts';

/**
 * Applies a user-room event to the list of the user's boards. Pure and
 * idempotent; returns the same array when the event changes nothing.
 */
export function applyBoardListEvent(boards: BoardSummaryDto[], event: UserEvent): BoardSummaryDto[] {
  switch (event.type) {
    case 'membership:added': {
      const summary = event.data;
      if (!boards.some((board) => board.id === summary.id)) return [summary, ...boards];
      return boards.map((board) => (board.id === summary.id ? summary : board));
    }
    case 'membership:removed':
    case 'board:deleted': {
      const { boardId } = event.data;
      return boards.some((board) => board.id === boardId)
        ? boards.filter((board) => board.id !== boardId)
        : boards;
    }
    // Only the open board cares (see useBoardRealtime).
    case 'card:watch-updated':
      return boards;
    default: {
      const unhandled: never = event;
      return unhandled;
    }
  }
}
