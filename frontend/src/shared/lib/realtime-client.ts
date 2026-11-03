import {
  REALTIME_NAMESPACE,
  REALTIME_PATH,
  REALTIME_UNAUTHORIZED,
  isBoardEventName,
  isUserEventName,
  type BoardRoomRequest,
  type ClientToServerEvents,
  type JoinBoardAck,
  type RealtimeEnvelope,
  type RealtimeMessage,
  type ServerToClientEvents,
} from '@trello/contracts';
import { io, type Socket } from 'socket.io-client';
import { useRealtimeStore, type RealtimeStatus } from '../store/realtime-store';
import { getAuthHandlers, setSocketIdSource } from './http';

export type RealtimeListener = (message: RealtimeMessage) => void;

/** The part of a socket this client uses. Tests replace the real one with a fake. */
export interface RealtimeSocket {
  readonly id: string | undefined;
  readonly connected: boolean;
  connect(): void;
  disconnect(): void;
  onConnect(listener: () => void): void;
  onConnectError(listener: (error: Error) => void): void;
  onDisconnect(listener: (reason: string) => void): void;
  onAny(listener: (eventName: string, payload: unknown) => void): void;
  emitJoin(request: BoardRoomRequest, ack: (result: JoinBoardAck) => void): void;
  emitLeave(request: BoardRoomRequest): void;
}

export interface SocketOptions {
  /** Called on every connection attempt; the token goes into the handshake. */
  auth: (send: (data: { token: string | null }) => void) => void;
}

export type SocketFactory = (options: SocketOptions) => RealtimeSocket;

/** Ack wait for `board:join` before the client gives up on it. */
export const JOIN_ACK_TIMEOUT_MS = 5_000;
/** A hold nobody released is dropped after this long, so realtime cannot freeze for good. */
export const HOLD_TIMEOUT_MS = 120_000;
/** Consecutive refused handshakes (or server-side closes) before the client stops trying. */
const MAX_RENEWALS = 2;

function createSocketIoSocket({ auth }: SocketOptions): RealtimeSocket {
  const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(REALTIME_NAMESPACE, {
    path: REALTIME_PATH,
    transports: ['websocket'],
    autoConnect: false,
    auth,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
  });
  return {
    get id() {
      return socket.id;
    },
    get connected() {
      return socket.connected;
    },
    connect: () => void socket.connect(),
    disconnect: () => void socket.disconnect(),
    onConnect: (listener) => void socket.on('connect', listener),
    onConnectError: (listener) => void socket.on('connect_error', listener),
    onDisconnect: (listener) => void socket.on('disconnect', listener),
    onAny: (listener) => void socket.onAny((name: string, payload: unknown) => listener(name, payload)),
    emitJoin: (request, ack) => void socket.emit('board:join', request, ack),
    emitLeave: (request) => void socket.emit('board:leave', request),
  };
}

let socketFactory: SocketFactory = createSocketIoSocket;
let socket: RealtimeSocket | null = null;

/** Replaces the socket implementation (tests). Drops the current socket. */
export function setSocketFactory(factory: SocketFactory | null): void {
  resetConnection();
  socketFactory = factory ?? createSocketIoSocket;
}

const listeners = new Set<RealtimeListener>();
let started = false;
/** Token sent in the last handshake; tells `renew` whether the HTTP layer already refreshed. */
let tokenUsed: string | null = null;
let renewals = 0;
/** Bumped by `stop` and every new renewal, so a stale refresh result is ignored. */
let renewEpoch = 0;

let holdCount = 0;
let holdEpoch = 0;
let buffer: RealtimeMessage[] = [];
const holdTimers = new Set<ReturnType<typeof setTimeout>>();

function setStatus(status: RealtimeStatus): void {
  useRealtimeStore.getState().setStatus(status);
}

function deliver(message: RealtimeMessage): void {
  for (const listener of [...listeners]) {
    try {
      listener(message);
    } catch (error) {
      console.error('Realtime listener failed', error);
    }
  }
}

function flush(): void {
  while (holdCount === 0) {
    const next = buffer.shift();
    if (!next) return;
    deliver(next);
  }
}

function isEnvelope(payload: unknown): payload is RealtimeEnvelope<unknown> {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'boardId' in payload &&
    typeof payload.boardId === 'string' &&
    'actorId' in payload &&
    typeof payload.actorId === 'string' &&
    'data' in payload
  );
}

function handleEvent(name: string, payload: unknown): void {
  if (!started || !(isBoardEventName(name) || isUserEventName(name)) || !isEnvelope(payload)) return;
  // The name was checked above, so name + envelope is a RealtimeMessage; TypeScript cannot
  // correlate the two on its own.
  const message = { ...payload, type: name } as unknown as RealtimeMessage;
  if (holdCount > 0) buffer.push(message);
  else deliver(message);
}

function connectNow(): void {
  if (started) socket?.connect();
}

/** The server refused or closed the connection because of the token: get a fresh one and reconnect. */
async function renew(): Promise<void> {
  renewals += 1;
  const handlers = getAuthHandlers();
  if (renewals > MAX_RENEWALS || !handlers) {
    setStatus('offline');
    return;
  }
  setStatus('reconnecting');
  const epoch = ++renewEpoch;
  const current = handlers.getAccessToken();
  if (current !== null && current !== tokenUsed) {
    // The HTTP layer already refreshed the session since the last handshake.
    connectNow();
    return;
  }
  const fresh = await handlers.refreshAccessToken();
  if (epoch !== renewEpoch || !started) return;
  if (fresh === null) {
    setStatus('offline');
    return;
  }
  connectNow();
}

function onConnect(): void {
  if (!started) return;
  renewals = 0;
  setStatus('connected');
}

function onConnectError(error: Error): void {
  if (!started) return;
  if (error.message === REALTIME_UNAUTHORIZED) void renew();
  else setStatus('reconnecting');
}

function onDisconnect(reason: string): void {
  if (reason === 'io client disconnect') {
    setStatus('idle');
    return;
  }
  if (!started) return;
  if (reason === 'io server disconnect') void renew();
  else setStatus('reconnecting');
}

function ensureSocket(): RealtimeSocket {
  if (socket) return socket;
  const created = socketFactory({
    auth: (send) => {
      tokenUsed = getAuthHandlers()?.getAccessToken() ?? null;
      send({ token: tokenUsed });
    },
  });
  created.onConnect(onConnect);
  created.onConnectError(onConnectError);
  created.onDisconnect(onDisconnect);
  created.onAny(handleEvent);
  socket = created;
  return created;
}

function dropHolds(): void {
  holdEpoch += 1;
  holdCount = 0;
  buffer = [];
  for (const timer of holdTimers) clearTimeout(timer);
  holdTimers.clear();
}

function resetConnection(): void {
  started = false;
  renewEpoch += 1;
  renewals = 0;
  tokenUsed = null;
  dropHolds();
  socket?.disconnect();
  socket = null;
}

function start(): void {
  if (started) return;
  started = true;
  renewals = 0;
  setStatus('connecting');
  ensureSocket().connect();
}

function stop(): void {
  const wasStarted = started;
  started = false;
  renewEpoch += 1;
  renewals = 0;
  dropHolds();
  if (wasStarted) socket?.disconnect();
  setStatus('idle');
}

function retry(): void {
  if (!started || useRealtimeStore.getState().status !== 'offline') return;
  renewals = 0;
  void renew();
}

function joinBoard(boardId: string): Promise<JoinBoardAck> {
  const active = socket;
  if (!active?.connected) return Promise.resolve({ ok: false, code: 'INTERNAL_ERROR' });
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, code: 'INTERNAL_ERROR' }), JOIN_ACK_TIMEOUT_MS);
    active.emitJoin({ boardId }, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
}

function leaveBoard(boardId: string): void {
  if (socket?.connected) socket.emitLeave({ boardId });
}

function subscribe(listener: RealtimeListener): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

function hold(): () => void {
  const epoch = holdEpoch;
  let released = false;
  holdCount += 1;
  const release = () => {
    if (released || epoch !== holdEpoch) return;
    released = true;
    clearTimeout(timer);
    holdTimers.delete(timer);
    holdCount -= 1;
    flush();
  };
  const timer = setTimeout(() => {
    if (import.meta.env.DEV) console.warn('A realtime hold was not released; releasing it.');
    release();
  }, HOLD_TIMEOUT_MS);
  holdTimers.add(timer);
  return release;
}

function socketId(): string | null {
  return socket?.connected ? (socket.id ?? null) : null;
}

export const realtime = {
  /** Connects (idempotent). The socket is created lazily and never auto-connects. */
  start,
  /** Disconnects, drops held events; status `idle`. Called on sign-out. */
  stop,
  /** One more attempt after `offline` (the indicator's button). */
  retry,
  /** Only when connected; no ack in 5 s gives `INTERNAL_ERROR`. */
  joinBoard,
  /** Only when connected (never buffered for a later connection). */
  leaveBoard,
  subscribe,
  /** Holds events until every hold is released; returns an idempotent release. */
  hold,
  socketId,
};

setSocketIdSource(socketId);
