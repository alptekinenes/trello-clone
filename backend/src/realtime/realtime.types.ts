import type { ClientToServerEvents, ServerToClientEvents } from '@trello/contracts';
import type { DefaultEventsMap, Namespace, Socket } from 'socket.io';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';

/** What the handshake middleware stores on every authenticated socket. */
export interface SocketData {
  user: AuthUser;
  /** When the access token expires (ms since epoch); the server closes the socket then. */
  expiresAt: number;
  /** Counts board:join / board:leave calls, so a slow older join cannot undo a newer one. */
  roomSeq: number;
}

export type RealtimeNamespace = Namespace<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>;

export type RealtimeSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>;
