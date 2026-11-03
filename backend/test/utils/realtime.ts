import { INestApplication } from '@nestjs/common';
import {
  type ClientToServerEvents,
  type JoinBoardAck,
  REALTIME_NAMESPACE,
  REALTIME_PATH,
  type RealtimeEnvelope,
  type RealtimeEventMap,
  type RealtimeEventName,
  type ServerToClientEvents,
} from '@trello/contracts';
import { io, type Socket } from 'socket.io-client';
import { RealtimeService } from '../../src/realtime/realtime.service.js';
import type { TestUser } from './users.js';

export type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const DEFAULT_WAIT_MS = 2_000;

/** Board id used by sentinel events; no real board has it. */
const SENTINEL_BOARD_ID = '00000000-0000-4000-8000-0000000000ff';

const openSockets = new Set<TestSocket>();

/** Raw access token of a test user (TestUser.auth is the Authorization header value). */
export function tokenOf(user: TestUser): string {
  return user.auth.slice('Bearer '.length);
}

async function realtimeUrl(app: INestApplication): Promise<string> {
  return `${await app.getUrl()}${REALTIME_NAMESPACE}`;
}

function createClient(url: string, auth?: Record<string, unknown>, query?: Record<string, string>) {
  const socket: TestSocket = io(url, {
    path: REALTIME_PATH,
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    ...(auth ? { auth } : {}),
    ...(query ? { query } : {}),
  });
  openSockets.add(socket);
  return socket;
}

/** Connects with a valid token (a TestUser or a raw token) and resolves once connected. */
export async function connectAs(app: INestApplication, who: TestUser | string): Promise<TestSocket> {
  const token = typeof who === 'string' ? who : tokenOf(who);
  const socket = createClient(await realtimeUrl(app), { token });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', (error) => reject(error));
  });
  return socket;
}

export interface HandshakeError extends Error {
  data?: unknown;
}

/** Tries to connect and resolves with the `connect_error`; fails when the connection succeeds. */
export async function connectExpectingError(
  app: INestApplication,
  options: { auth?: Record<string, unknown>; query?: Record<string, string> } = {},
): Promise<{ error: HandshakeError; socket: TestSocket }> {
  const socket = createClient(await realtimeUrl(app), options.auth, options.query);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => reject(new Error('The connection was accepted')));
    socket.once('connect_error', (error: HandshakeError) => resolve({ error, socket }));
  });
}

/** Connects to the default namespace, where the gateway has no handlers. */
export async function connectToDefaultNamespace(app: INestApplication): Promise<TestSocket> {
  const socket = createClient(await app.getUrl());
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', (error) => reject(error));
  });
  return socket;
}

export function closeAllSockets(): void {
  for (const socket of openSockets) socket.close();
  openSockets.clear();
}

interface AckEmitter {
  timeout(ms: number): { emitWithAck(event: string, ...args: unknown[]): Promise<unknown> };
}

/** Sends board:join with any body, so tests can also send bodies the types forbid. */
export async function joinRaw(socket: TestSocket, ...body: unknown[]): Promise<unknown> {
  return (socket as unknown as AckEmitter).timeout(DEFAULT_WAIT_MS).emitWithAck('board:join', ...body);
}

export async function join(socket: TestSocket, boardId: string): Promise<JoinBoardAck> {
  return (await joinRaw(socket, { boardId })) as JoinBoardAck;
}

export async function leave(socket: TestSocket, boardId: string): Promise<void> {
  await socket.timeout(DEFAULT_WAIT_MS).emitWithAck('board:leave', { boardId });
}

export interface RecordedEvent {
  type: string;
  envelope: RealtimeEnvelope<unknown>;
}

export interface EventRecorder {
  /** Every event so far, in arrival order. */
  readonly events: readonly RecordedEvent[];
  /** The next event that nobody consumed yet; rejects after `timeoutMs`. */
  next(timeoutMs?: number): Promise<RecordedEvent>;
}

/** Records every event of the socket, in order. Socket.io keeps the order of one connection. */
export function recordEvents(socket: TestSocket): EventRecorder {
  const events: RecordedEvent[] = [];
  let consumed = 0;
  const waiters: Array<() => void> = [];

  socket.onAny((type: string, envelope: RealtimeEnvelope<unknown>) => {
    events.push({ type, envelope });
    for (const wake of waiters.splice(0)) wake();
  });

  return {
    events,
    async next(timeoutMs = DEFAULT_WAIT_MS) {
      const deadline = Date.now() + timeoutMs;
      while (consumed >= events.length) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error(`No event within ${timeoutMs} ms`);
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, remaining);
          waiters.push(() => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
      const event = events[consumed];
      consumed += 1;
      if (!event) throw new Error('Unreachable: event missing');
      return event;
    },
  };
}

/** The next event must be `type`; returns its envelope. */
export async function expectNext<K extends RealtimeEventName>(
  recorder: EventRecorder,
  type: K,
  timeoutMs = DEFAULT_WAIT_MS,
): Promise<RealtimeEnvelope<RealtimeEventMap[K]>> {
  const event = await recorder.next(timeoutMs);
  if (event.type !== type) {
    throw new Error(`Expected the next event to be ${type}, got ${event.type}`);
  }
  return event.envelope as RealtimeEnvelope<RealtimeEventMap[K]>;
}

/**
 * Proves that nothing arrived before the sentinel: trigger an event this socket is sure to
 * get (see sendSentinel), then call this. Socket.io keeps the order of one connection,
 * so if the sentinel is the next event, no earlier event was sent to this socket.
 */
export async function expectNextAfterSentinel(
  recorder: EventRecorder,
  sentinelType: RealtimeEventName = 'membership:removed',
  timeoutMs = DEFAULT_WAIT_MS,
): Promise<void> {
  const event = await recorder.next(timeoutMs);
  if (event.type !== sentinelType || event.envelope.boardId !== SENTINEL_BOARD_ID) {
    throw new Error(`Expected the sentinel but received ${event.type} first`);
  }
}

/** Sends the user's sockets an event that carries no data of interest. */
export function sendSentinel(app: INestApplication, userId: string): void {
  app.get(RealtimeService).toUsers([userId], SENTINEL_BOARD_ID, { actorId: userId, socketId: null }, {
    type: 'membership:removed',
    data: { boardId: SENTINEL_BOARD_ID },
  });
}

/**
 * Everything the socket receives up to the sentinel, in order (see sendSentinel).
 * Use it when the number of events is not fixed, e.g. rebalances in a busy test.
 */
export async function collectUntilSentinel(
  recorder: EventRecorder,
  timeoutMs = DEFAULT_WAIT_MS,
): Promise<RecordedEvent[]> {
  const collected: RecordedEvent[] = [];
  for (;;) {
    const event = await recorder.next(timeoutMs);
    if (event.envelope.boardId === SENTINEL_BOARD_ID) return collected;
    collected.push(event);
  }
}
