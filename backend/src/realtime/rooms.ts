const BOARD_ROOM_PREFIX = 'board:';
const USER_ROOM_PREFIX = 'user:';

/** Room of everyone looking at one board. */
export function boardRoom(boardId: string): string {
  return `${BOARD_ROOM_PREFIX}${boardId}`;
}

/** Room of all sockets (tabs) of one user. */
export function userRoom(userId: string): string {
  return `${USER_ROOM_PREFIX}${userId}`;
}

/** Socket ids and user rooms never start with `board:`, so the prefix tells board rooms apart. */
export function isBoardRoom(room: string): boolean {
  return room.startsWith(BOARD_ROOM_PREFIX);
}
