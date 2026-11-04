import {
  isBoardEventName,
  isUserEventName,
  type BoardEvent,
  type RealtimeMessage,
  type UserEvent,
} from '@trello/contracts';

/** The message as a board-room event, or null for a user-room event. */
export function asBoardEvent(message: RealtimeMessage): BoardEvent | null {
  // The name tells which side of the union the message is; TypeScript cannot narrow the parent by it.
  return isBoardEventName(message.type) ? (message as BoardEvent) : null;
}

/** The message as a user-room event, or null for a board-room event. */
export function asUserEvent(message: RealtimeMessage): UserEvent | null {
  return isUserEventName(message.type) ? (message as UserEvent) : null;
}
