import type { BoardSummaryDto, MemberDto } from './boards.js';
import type { CardMemberChange, CardSummaryDto } from './cards.js';
import type { CommentDto } from './comments.js';
import type { ChecklistDto, ChecklistItemDto } from './checklists.js';
import type { ErrorCode } from './errors.js';
import type { LabelDto } from './labels.js';
import type { ListDto } from './lists.js';
import type { PositionRebalancedData } from './position.js';

/** Socket.io namespace of the app. The HTTP path is socket.io's default. */
export const REALTIME_NAMESPACE = '/realtime';
export const REALTIME_PATH = '/socket.io';

/** Header naming the sender's socket, so its own change is not echoed back. Lower case: Node lower-cases header names. */
export const SOCKET_ID_HEADER = 'x-socket-id';

/** `connect_error` message when the handshake token is missing, invalid or expired. */
export const REALTIME_UNAUTHORIZED = 'UNAUTHORIZED';

/** Board fields every member may see. `myRole` differs per member, so it is never broadcast. */
export type BoardInfoDto = Omit<BoardSummaryDto, 'myRole'>;

/** A card's checklist counters after a checklist change, for its tile. */
export type CardChecklistCounts = Pick<CardSummaryDto, 'checklistTotal' | 'checklistDone'>;

export type { PositionRebalancedData, PositionUpdate } from './position.js';

/** Events for everyone in `board:<id>`. */
export interface BoardEventMap {
  'board:updated': BoardInfoDto;
  'member:added': MemberDto;
  'member:updated': MemberDto;
  'member:removed': { userId: string };
  'list:created': ListDto;
  'list:updated': ListDto;
  'list:moved': { id: string; position: number };
  'list:deleted': { id: string };
  'card:created': CardSummaryDto;
  /** Never carries the description text; `descriptionChanged` tells an open card to reload it. */
  'card:updated': { card: CardSummaryDto; descriptionChanged: boolean };
  'card:moved': { id: string; fromListId: string; toListId: string; position: number };
  'card:deleted': { id: string; listId: string };
  'card:label-added': { cardId: string; labelId: string };
  'card:label-removed': { cardId: string; labelId: string };
  'card:member-added': CardMemberChange;
  'card:member-removed': CardMemberChange;
  'label:created': LabelDto;
  'label:updated': LabelDto;
  'label:deleted': { id: string };
  'checklist:created': ChecklistDto;
  'checklist:updated': { id: string; cardId: string; title: string };
  'checklist:moved': { id: string; cardId: string; position: number };
  'checklist:deleted': { id: string; cardId: string; counts: CardChecklistCounts };
  'checklist-item:created': { item: ChecklistItemDto; cardId: string; counts: CardChecklistCounts };
  'checklist-item:updated': { item: ChecklistItemDto; cardId: string; counts: CardChecklistCounts };
  'checklist-item:moved': {
    id: string;
    cardId: string;
    fromChecklistId: string;
    toChecklistId: string;
    position: number;
  };
  'checklist-item:deleted': {
    id: string;
    checklistId: string;
    cardId: string;
    counts: CardChecklistCounts;
  };
  'comment:created': { comment: CommentDto; commentCount: number };
  'comment:updated': CommentDto;
  'comment:deleted': { id: string; cardId: string; commentCount: number };
  'position:rebalanced': PositionRebalancedData;
}

/** Events for one user's sockets (`user:<id>`), on whatever page they are. */
export interface UserEventMap {
  /** The recipient's own summary (its `myRole` is theirs). */
  'membership:added': BoardSummaryDto;
  'membership:removed': { boardId: string };
  'board:deleted': { boardId: string };
  /** Only the watching user's own sockets; never the board room. */
  'card:watch-updated': { cardId: string; watching: boolean };
}

export type BoardEventName = keyof BoardEventMap;
export type UserEventName = keyof UserEventMap;
export type RealtimeEventName = BoardEventName | UserEventName;
export type RealtimeEventMap = BoardEventMap & UserEventMap;

/** What goes over the wire with every event. */
export interface RealtimeEnvelope<T> {
  boardId: string;
  /** The user whose request caused the change. */
  actorId: string;
  /** ISO time of the broadcast (debugging only; never used for ordering). */
  emittedAt: string;
  data: T;
}

/** An event as code passes it around: name and payload, narrowed by `type`. */
export type BoardEvent = {
  [K in BoardEventName]: { type: K; data: BoardEventMap[K] };
}[BoardEventName];
export type UserEvent = {
  [K in UserEventName]: { type: K; data: UserEventMap[K] };
}[UserEventName];

/** A received event with its envelope fields. */
export type RealtimeMessage = (BoardEvent | UserEvent) & Omit<RealtimeEnvelope<unknown>, 'data'>;

/** Records, so a new event name that is not listed here fails to compile. */
const BOARD_EVENTS: Record<BoardEventName, true> = {
  'board:updated': true,
  'member:added': true,
  'member:updated': true,
  'member:removed': true,
  'list:created': true,
  'list:updated': true,
  'list:moved': true,
  'list:deleted': true,
  'card:created': true,
  'card:updated': true,
  'card:moved': true,
  'card:deleted': true,
  'card:label-added': true,
  'card:label-removed': true,
  'card:member-added': true,
  'card:member-removed': true,
  'label:created': true,
  'label:updated': true,
  'label:deleted': true,
  'checklist:created': true,
  'checklist:updated': true,
  'checklist:moved': true,
  'checklist:deleted': true,
  'checklist-item:created': true,
  'checklist-item:updated': true,
  'checklist-item:moved': true,
  'checklist-item:deleted': true,
  'comment:created': true,
  'comment:updated': true,
  'comment:deleted': true,
  'position:rebalanced': true,
};
const USER_EVENTS: Record<UserEventName, true> = {
  'membership:added': true,
  'membership:removed': true,
  'board:deleted': true,
  'card:watch-updated': true,
};
export const BOARD_EVENT_NAMES = Object.keys(BOARD_EVENTS) as BoardEventName[];
export const USER_EVENT_NAMES = Object.keys(USER_EVENTS) as UserEventName[];

/** Own-property checks (not `in`), so `toString` and friends are never event names. */
export function isBoardEventName(name: string): name is BoardEventName {
  return Object.hasOwn(BOARD_EVENTS, name);
}

export function isUserEventName(name: string): name is UserEventName {
  return Object.hasOwn(USER_EVENTS, name);
}

export interface BoardRoomRequest {
  boardId: string;
}

export type JoinBoardAck =
  | { ok: true }
  | {
      ok: false;
      code: Extract<ErrorCode, 'NOT_FOUND' | 'VALIDATION_FAILED' | 'CONFLICT' | 'INTERNAL_ERROR'>;
    };

/** Typed maps for `Server<...>` / `Socket<...>` on both sides. */
export type ServerToClientEvents = {
  [K in RealtimeEventName]: (envelope: RealtimeEnvelope<RealtimeEventMap[K]>) => void;
};

export interface ClientToServerEvents {
  'board:join': (request: BoardRoomRequest, ack: (result: JoinBoardAck) => void) => void;
  'board:leave': (request: BoardRoomRequest, ack?: (result: { ok: true }) => void) => void;
}
