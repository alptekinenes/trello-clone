import { isBoardEventName, type BoardEvent, type RealtimeMessage } from '@trello/contracts';

/** The message as a board-room event, or null for a user-room event. */
export function asBoardEvent(message: RealtimeMessage): BoardEvent | null {
  // The name tells which side of the union the message is; TypeScript cannot narrow the parent by it.
  return isBoardEventName(message.type) ? (message as BoardEvent) : null;
}
