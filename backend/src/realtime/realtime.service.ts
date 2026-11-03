import { Injectable, Logger } from '@nestjs/common';
import type { BoardEvent, RealtimeEnvelope, UserEvent } from '@trello/contracts';
import type { EventOrigin } from './event-origin.js';
import { boardRoom, userRoom } from './rooms.js';
import type { RealtimeNamespace } from './realtime.types.js';

/** What `.emit` of a broadcast needs; the typed event map cannot follow a name that is only known at run time. */
interface Emitter {
  emit(type: string, envelope: RealtimeEnvelope<unknown>): boolean;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

/**
 * Sends changes to connected clients. Call it only after the write committed
 * (never inside a transaction callback). Nothing here throws: the data is
 * already saved, so a failed broadcast must not fail the request.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private namespace: RealtimeNamespace | null = null;

  /** Called once by the gateway (afterInit). Until then every method does nothing. */
  attach(namespace: RealtimeNamespace): void {
    this.namespace = namespace;
  }

  /** Sends the events to board:<id> in array order. */
  toBoard(boardId: string, origin: EventOrigin, events: readonly BoardEvent[]): void {
    const namespace = this.namespace;
    if (!namespace) return;
    for (const event of events) {
      this.send(namespace, boardRoom(boardId), boardId, origin, event);
    }
  }

  /** Sends one event to the user rooms; a socket that is in two of them still gets it once. */
  toUsers(
    userIds: readonly string[],
    boardId: string,
    origin: EventOrigin,
    event: UserEvent,
  ): void {
    const namespace = this.namespace;
    // `to([])` would address the whole namespace, so an empty list must stop here.
    if (!namespace || userIds.length === 0) return;
    this.send(namespace, userIds.map(userRoom), boardId, origin, event);
  }

  /** Takes every socket of the user out of board:<id> (removed member, left board). */
  removeUserFromBoard(boardId: string, userId: string): void {
    const namespace = this.namespace;
    if (!namespace) return;
    try {
      namespace.in(userRoom(userId)).socketsLeave(boardRoom(boardId));
    } catch (error) {
      this.logger.error(`Could not remove a user from board room ${boardId}: ${describe(error)}`);
    }
  }

  /** Empties board:<id> (board deleted). */
  closeBoardRoom(boardId: string): void {
    const namespace = this.namespace;
    if (!namespace) return;
    try {
      namespace.in(boardRoom(boardId)).socketsLeave(boardRoom(boardId));
    } catch (error) {
      this.logger.error(`Could not close board room ${boardId}: ${describe(error)}`);
    }
  }

  /**
   * The request's socket, left out of the broadcast, but only when it belongs to the
   * requester. Otherwise a client could mute someone else's event with a guessed id.
   */
  private excludedSocket(namespace: RealtimeNamespace, origin: EventOrigin): string | undefined {
    if (!origin.socketId) return undefined;
    const socket = namespace.sockets.get(origin.socketId);
    return socket?.data.user.id === origin.actorId ? origin.socketId : undefined;
  }

  private send(
    namespace: RealtimeNamespace,
    rooms: string | string[],
    boardId: string,
    origin: EventOrigin,
    event: BoardEvent | UserEvent,
  ): void {
    try {
      const except = this.excludedSocket(namespace, origin);
      const addressed = namespace.to(rooms);
      const target: Emitter = except ? addressed.except(except) : addressed;
      const envelope: RealtimeEnvelope<unknown> = {
        boardId,
        actorId: origin.actorId,
        emittedAt: new Date().toISOString(),
        data: event.data,
      };
      target.emit(event.type, envelope);
    } catch (error) {
      // The payload is left out of the log on purpose.
      this.logger.error(
        `Could not broadcast ${event.type} for board ${boardId}: ${describe(error)}`,
      );
    }
  }
}
