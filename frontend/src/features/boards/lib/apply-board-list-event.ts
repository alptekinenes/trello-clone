import type { BoardSummaryDto, RealtimeMessage } from '@trello/contracts';

/**
 * Applies a user-room event to the list of the user's boards. Pure and
 * idempotent; returns the same array when the event changes nothing.
 * Board-room events are not about this list.
 */
export function applyBoardListEvent(
  boards: BoardSummaryDto[],
  message: RealtimeMessage,
): BoardSummaryDto[] {
  switch (message.type) {
    case 'membership:added': {
      const summary = message.data;
      if (!boards.some((board) => board.id === summary.id)) return [summary, ...boards];
      return boards.map((board) => (board.id === summary.id ? summary : board));
    }
    case 'membership:removed':
    case 'board:deleted': {
      const { boardId } = message.data;
      return boards.some((board) => board.id === boardId)
        ? boards.filter((board) => board.id !== boardId)
        : boards;
    }
    default:
      return boards;
  }
}
