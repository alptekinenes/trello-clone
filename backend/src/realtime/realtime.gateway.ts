import { Logger } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import {
  type ClientToServerEvents,
  ErrorCode,
  type JoinBoardAck,
  REALTIME_NAMESPACE,
} from '@trello/contracts';
import { isUUID } from 'class-validator';
import { BoardAccessService } from '../access/board-access.service.js';
import { TokenService } from '../auth/token.service.js';
import { RealtimeService } from './realtime.service.js';
import type { RealtimeNamespace, RealtimeSocket } from './realtime.types.js';
import { boardRoom, isBoardRoom, userRoom } from './rooms.js';
import { createWsAuthMiddleware } from './ws-auth.middleware.js';

const JOIN_EVENT = 'board:join' satisfies keyof ClientToServerEvents;
const LEAVE_EVENT = 'board:leave' satisfies keyof ClientToServerEvents;

/** setTimeout stores its delay in 32 bits; longer delays fire at once. */
const MAX_TIMER_MS = 2_147_483_647;

/** The boardId of a board:join / board:leave body, or null when the body is not a valid one. */
function readBoardId(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const boardId = (body as Record<string, unknown>).boardId;
  return typeof boardId === 'string' && isUUID(boardId) ? boardId : null;
}

/**
 * Socket.io entry point (namespace /realtime). A socket gets in with a valid
 * access token, lands in `user:<id>` and may join one `board:<id>` room at a
 * time, after a membership check. Handlers return the ack and never throw:
 * global pipes and filters do not run for gateways.
 */
// Global guards run for gateways too; the rate limiter is meant for HTTP only.
@SkipThrottle()
@WebSocketGateway({ namespace: REALTIME_NAMESPACE })
export class RealtimeGateway
  implements OnGatewayInit<RealtimeNamespace>, OnGatewayConnection<RealtimeSocket>, OnGatewayDisconnect<RealtimeSocket>
{
  private readonly logger = new Logger(RealtimeGateway.name);
  /** Kept here rather than in `socket.data`, which an adapter may serialize one day. */
  private readonly expiryTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly tokens: TokenService,
    private readonly access: BoardAccessService,
    private readonly realtime: RealtimeService,
  ) {}

  afterInit(namespace: RealtimeNamespace): void {
    namespace.use(createWsAuthMiddleware(this.tokens));
    this.realtime.attach(namespace);
  }

  handleConnection(socket: RealtimeSocket): void {
    void socket.join(userRoom(socket.data.user.id));
    this.expireWithToken(socket);
  }

  handleDisconnect(socket: RealtimeSocket): void {
    const timer = this.expiryTimers.get(socket.id);
    if (timer) clearTimeout(timer);
    this.expiryTimers.delete(socket.id);
  }

  @SubscribeMessage(JOIN_EVENT)
  async joinBoard(
    @ConnectedSocket() socket: RealtimeSocket,
    @MessageBody() body: unknown,
  ): Promise<JoinBoardAck> {
    const seq = ++socket.data.roomSeq;
    const boardId = readBoardId(body);
    if (!boardId) return { ok: false, code: ErrorCode.VALIDATION_FAILED };

    const userId = socket.data.user.id;
    const room = boardRoom(boardId);
    try {
      if (!(await this.access.getRole(boardId, userId))) {
        return { ok: false, code: ErrorCode.NOT_FOUND };
      }
      // A newer join or leave came in while we were checking: it wins.
      if (seq !== socket.data.roomSeq) return { ok: false, code: ErrorCode.CONFLICT };

      // Copied first: leaving changes the set while we go through it.
      const otherBoardRooms = Array.from(socket.rooms).filter((r) => isBoardRoom(r) && r !== room);
      for (const other of otherBoardRooms) await socket.leave(other);
      await socket.join(room);

      // The member may have been removed between the check and the join. The removal
      // takes sockets out of the room, but could have run before this socket was in it.
      if (!(await this.access.getRole(boardId, userId))) {
        await socket.leave(room);
        return { ok: false, code: ErrorCode.NOT_FOUND };
      }
      return { ok: true };
    } catch (error) {
      if (seq === socket.data.roomSeq) await socket.leave(room);
      this.logger.warn(
        `board:join failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return { ok: false, code: ErrorCode.INTERNAL_ERROR };
    }
  }

  @SubscribeMessage(LEAVE_EVENT)
  leaveBoard(
    @ConnectedSocket() socket: RealtimeSocket,
    @MessageBody() body: unknown,
  ): { ok: true } | undefined {
    socket.data.roomSeq += 1;
    const boardId = readBoardId(body);
    // An invalid body is ignored without an ack.
    if (!boardId) return undefined;
    void socket.leave(boardRoom(boardId));
    return { ok: true };
  }

  /** No socket outlives its access token; the client refreshes and reconnects. */
  private expireWithToken(socket: RealtimeSocket): void {
    const delay = Math.min(Math.max(0, socket.data.expiresAt - Date.now()), MAX_TIMER_MS);
    const timer = setTimeout(() => {
      this.expiryTimers.delete(socket.id);
      socket.disconnect(true);
    }, delay);
    timer.unref();
    this.expiryTimers.set(socket.id, timer);
  }
}
