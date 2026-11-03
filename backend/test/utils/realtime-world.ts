import { INestApplication } from '@nestjs/common';
import {
  type CardSummaryDto,
  type ListDto,
  type RealtimeEnvelope,
  type RealtimeEventMap,
  type RealtimeEventName,
  SOCKET_ID_HEADER,
} from '@trello/contracts';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { createBoard, createCard, createList } from './board-fixtures.js';
import {
  connectAs,
  type EventRecorder,
  expectNext,
  expectNextAfterSentinel,
  join,
  recordEvents,
  sendSentinel,
  type TestSocket,
} from './realtime.js';
import { createUser, type TestUser } from './users.js';

/** Text that must never appear in any broadcast. */
export const SECRET_DESCRIPTION = 'GİZLİ-AÇIKLAMA-7f3a';

/** A description written by a test request; it must not come back in a broadcast either. */
export const NEW_SECRET_DESCRIPTION = 'GİZLİ-YENİ-METİN-91bc';

/** A connected socket and everything it receives, in order. */
export interface Watcher {
  socket: TestSocket;
  events: EventRecorder;
}

/**
 * One board with three people watching it:
 * - A owns the board and has two sockets (`a1` sends the requests, `a2` is another tab),
 * - B is a member with one socket,
 * - C owns another board and watches that one.
 * Everything is created before any socket joins, so the setup itself broadcasts nothing.
 */
export interface World {
  a: TestUser;
  b: TestUser;
  c: TestUser;
  boardId: string;
  otherBoardId: string;
  list1: ListDto;
  list2: ListDto;
  /** Two cards on list1 and one on list2. Every card has a secret description. */
  card1: CardSummaryDto;
  card2: CardSummaryDto;
  card3: CardSummaryDto;
  a1: Watcher;
  a2: Watcher;
  b1: Watcher;
  c1: Watcher;
}

export async function watch(
  app: INestApplication,
  user: TestUser,
  boardId: string | null,
): Promise<Watcher> {
  const socket = await connectAs(app, user);
  const events = recordEvents(socket);
  if (boardId) await join(socket, boardId);
  return { socket, events };
}

/** Everything but the sockets: users, boards, lists and cards. */
export async function createWorldData(
  app: INestApplication,
): Promise<Omit<World, 'a1' | 'a2' | 'b1' | 'c1'>> {
  const prisma = app.get(PrismaService);
  const [a, b, c] = [
    await createUser(app, 'Ayşe'),
    await createUser(app, 'Burak'),
    await createUser(app, 'Cem'),
  ];
  const boardId = await createBoard(app, a, 'Pano');
  const otherBoardId = await createBoard(app, c, 'Başka pano');
  await prisma.boardMember.create({ data: { boardId, userId: b.user.id, role: 'MEMBER' } });

  const list1 = await createList(app, a, boardId, 'Liste 1');
  const list2 = await createList(app, a, boardId, 'Liste 2');
  const card1 = await createCard(app, a, list1.id, 'Kart 1');
  const card2 = await createCard(app, a, list1.id, 'Kart 2');
  const card3 = await createCard(app, a, list2.id, 'Kart 3');
  await prisma.card.updateMany({
    where: { boardId },
    data: { description: SECRET_DESCRIPTION },
  });
  return { a, b, c, boardId, otherBoardId, list1, list2, card1, card2, card3 };
}

/** Creates the world and connects its sockets. A, B and C have joined their boards. */
export async function createWorld(app: INestApplication): Promise<World> {
  const data = await createWorldData(app);
  const a1 = await watch(app, data.a, data.boardId);
  const a2 = await watch(app, data.a, data.boardId);
  const b1 = await watch(app, data.b, data.boardId);
  const c1 = await watch(app, data.c, data.otherBoardId);
  return { ...data, a1, a2, b1, c1 };
}

/** What the sockets of the world see, in order. */
export interface ExpectedEvent<K extends RealtimeEventName = RealtimeEventName> {
  type: K;
  data: RealtimeEventMap[K];
}

/** Typed constructor, so `data` is checked against the event name. */
export function event<K extends RealtimeEventName>(
  type: K,
  data: RealtimeEventMap[K],
): ExpectedEvent<K> {
  return { type, data };
}

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

/** Requests as `user`; with `socket` the request names it in X-Socket-Id like the web app does. */
export function api(app: INestApplication, user: TestUser, socket?: TestSocket) {
  const send = (method: Method, url: string) => {
    const test = request(app.getHttpServer())[method](`/api/v1${url}`).set('Authorization', user.auth);
    return socket?.id ? test.set(SOCKET_ID_HEADER, socket.id) : test;
  };
  return {
    get: (url: string) => send('get', url),
    post: (url: string) => send('post', url),
    patch: (url: string) => send('patch', url),
    put: (url: string) => send('put', url),
    delete: (url: string) => send('delete', url),
  };
}

/** Sends every given user one sentinel event. */
export function sendSentinels(app: INestApplication, users: readonly TestUser[]): void {
  for (const user of users) sendSentinel(app, user.user.id);
}

/** An envelope with the name of its event. */
export interface Received {
  type: RealtimeEventName;
  envelope: RealtimeEnvelope<unknown>;
}

/**
 * Proves what a watcher received since the last check: exactly `expected`, in order,
 * with the envelope of `boardId` and `actorId`, and nothing else before the sentinel.
 * Returns what arrived for further checks.
 */
export async function expectReceived(
  watcher: Watcher,
  expected: readonly ExpectedEvent[],
  context: { boardId: string; actorId: string },
): Promise<Received[]> {
  const received: Received[] = [];
  for (const wanted of expected) {
    const envelope = await expectNext(watcher.events, wanted.type);
    expect(envelope).toMatchObject({ boardId: context.boardId, actorId: context.actorId });
    expect(envelope.data).toEqual(wanted.data);
    received.push({ type: wanted.type, envelope });
  }
  await expectNextAfterSentinel(watcher.events);
  return received;
}

/** Proves that a watcher received nothing since the last check. */
export async function expectNothing(watcher: Watcher): Promise<void> {
  await expectNextAfterSentinel(watcher.events);
}

/** The strings a broadcast must never contain. */
export function forbiddenStrings(world: World): string[] {
  return [
    SECRET_DESCRIPTION,
    NEW_SECRET_DESCRIPTION,
    'tokenHash',
    'inviteUrl',
    'passwordHash',
    'refreshToken',
    world.a1.socket.id,
    world.a2.socket.id,
    world.b1.socket.id,
    world.c1.socket.id,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);
}

/** Fails when an envelope leaks something forbidden, or carries `myRole` outside membership:added. */
export function expectNoLeak(received: readonly Received[], forbidden: readonly string[]): void {
  for (const { type, envelope } of received) {
    const text = JSON.stringify(envelope);
    for (const value of forbidden) expect(text).not.toContain(value);
    if (type !== 'membership:added') expect(text).not.toContain('myRole');
  }
}
