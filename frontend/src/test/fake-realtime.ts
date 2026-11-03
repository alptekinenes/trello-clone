import type {
  BoardRoomRequest,
  JoinBoardAck,
  RealtimeEnvelope,
  RealtimeEventMap,
  RealtimeEventName,
} from '@trello/contracts';
import { act } from '@testing-library/react';
import type { RealtimeSocket, SocketFactory, SocketOptions } from '../shared/lib/realtime-client';

/** Answers a `board:join`; `null` means the server never answers. */
type JoinHandler = (boardId: string) => JoinBoardAck | null;

const OK: JoinBoardAck = { ok: true };

export class FakeSocket implements RealtimeSocket {
  id: string | undefined = undefined;
  connected = false;
  /** Tokens the client put in each handshake attempt (one per `connect()`). */
  readonly handshakeTokens: (string | null)[] = [];
  connectCalls = 0;
  private readonly options: SocketOptions;
  private connectListeners: (() => void)[] = [];
  private errorListeners: ((error: Error) => void)[] = [];
  private disconnectListeners: ((reason: string) => void)[] = [];
  private anyListeners: ((eventName: string, payload: unknown) => void)[] = [];

  constructor(options: SocketOptions) {
    this.options = options;
  }

  connect(): void {
    this.connectCalls += 1;
    this.options.auth(({ token }) => this.handshakeTokens.push(token));
  }

  disconnect(): void {
    if (!this.connected) return;
    this.markDisconnected('io client disconnect');
  }

  onConnect(listener: () => void): void {
    this.connectListeners.push(listener);
  }
  onConnectError(listener: (error: Error) => void): void {
    this.errorListeners.push(listener);
  }
  onDisconnect(listener: (reason: string) => void): void {
    this.disconnectListeners.push(listener);
  }
  onAny(listener: (eventName: string, payload: unknown) => void): void {
    this.anyListeners.push(listener);
  }

  emitJoin(request: BoardRoomRequest, ack: (result: JoinBoardAck) => void): void {
    state.joins.push(request.boardId);
    const result = state.joinHandler(request.boardId);
    if (result) ack(result);
  }

  emitLeave(request: BoardRoomRequest): void {
    state.leaves.push(request.boardId);
  }

  markConnected(): void {
    this.connected = true;
    this.id = 'fake-socket-id';
    this.connectListeners.forEach((listener) => listener());
  }

  markDisconnected(reason: string): void {
    this.connected = false;
    this.id = undefined;
    this.disconnectListeners.forEach((listener) => listener(reason));
  }

  refuseHandshake(message: string): void {
    this.errorListeners.forEach((listener) => listener(new Error(message)));
  }

  receive(eventName: string, payload: unknown): void {
    this.anyListeners.forEach((listener) => listener(eventName, payload));
  }
}

interface FakeState {
  socket: FakeSocket | null;
  joins: string[];
  leaves: string[];
  joinHandler: JoinHandler;
}

const state: FakeState = { socket: null, joins: [], leaves: [], joinHandler: () => OK };

export const createFakeSocket: SocketFactory = (options) => {
  state.socket = new FakeSocket(options);
  return state.socket;
};

function currentSocket(): FakeSocket {
  if (!state.socket) throw new Error('The app has not created a socket yet (is anyone signed in?)');
  return state.socket;
}

/** Wraps server-driven changes so React state updates are flushed like in the browser. */
function serverSide(action: () => void): void {
  act(action);
}

export interface EmitOptions {
  boardId: string;
  /** The user whose request caused the change; defaults to someone else. */
  actorId?: string;
}

/**
 * Stands in for the server. Nothing connects by itself: a test calls `connect()`
 * when it wants a live socket, so existing tests that never join stay unchanged.
 */
export const fakeRealtime = {
  get socket(): FakeSocket {
    return currentSocket();
  },
  /** Board ids of every `board:join` the client sent, in order. */
  get joins(): readonly string[] {
    return state.joins;
  },
  get leaves(): readonly string[] {
    return state.leaves;
  },
  /** How the fake server answers joins. Default `{ ok: true }`; return `null` for no answer. */
  ackJoin(handler: JoinHandler): void {
    state.joinHandler = handler;
  },
  connect(): void {
    serverSide(() => currentSocket().markConnected());
  },
  drop(reason: string): void {
    serverSide(() => currentSocket().markDisconnected(reason));
  },
  rejectHandshake(message: string): void {
    serverSide(() => currentSocket().refuseHandshake(message));
  },
  serverEmit<K extends RealtimeEventName>(
    type: K,
    data: RealtimeEventMap[K],
    { boardId, actorId = 'someone-else' }: EmitOptions,
  ): void {
    const envelope: RealtimeEnvelope<RealtimeEventMap[K]> = {
      boardId,
      actorId,
      emittedAt: '2026-11-03T10:00:00.000Z',
      data,
    };
    serverSide(() => currentSocket().receive(type, envelope));
  },
};

export function resetFakeRealtime(): void {
  state.socket = null;
  state.joins = [];
  state.leaves = [];
  state.joinHandler = () => OK;
}
