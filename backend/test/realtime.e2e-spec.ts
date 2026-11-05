import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ErrorCode, REALTIME_UNAUTHORIZED, SOCKET_ID_HEADER } from '@trello/contracts';
import { ACTIVITY_SELECT, toActivityDto } from '../src/activity/activity.mapper.js';
import { hashToken, newOpaqueToken } from '../src/common/crypto/opaque-token.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.js';
import { RealtimeService } from '../src/realtime/realtime.service.js';
import { createBoard, MISSING_ID } from './utils/board-fixtures.js';
import { createTestApp } from './utils/create-test-app.js';
import { resetDatabase } from './utils/database.js';
import {
  closeAllSockets,
  connectAs,
  connectExpectingError,
  connectToDefaultNamespace,
  expectNext,
  expectNextAfterSentinel,
  join,
  joinRaw,
  leave,
  recordEvents,
  sendSentinel,
  tokenOf,
} from './utils/realtime.js';
import {
  api,
  createWorld,
  event,
  type ExpectedEvent,
  expectNothing,
  expectReceived,
  sendSentinels,
  type Watcher,
  watch,
  type World,
} from './utils/realtime-world.js';
import { createUser } from './utils/users.js';

describe('Realtime (e2e, socket.io)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp({ listen: true });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  afterEach(() => {
    closeAllSockets();
    vi.restoreAllMocks();
  });

  /** A board-room event that does not touch the database. */
  function sendToBoard(boardId: string, actorId: string): void {
    app
      .get(RealtimeService)
      .toBoard(boardId, { actorId, socketId: null }, [{ type: 'list:deleted', data: { id: 'x' } }]);
  }

  describe('connection', () => {
    it('rejects a handshake without a token', async () => {
      const { error, socket } = await connectExpectingError(app);
      expect(error.message).toBe(REALTIME_UNAUTHORIZED);
      expect(error.data).toEqual({ code: REALTIME_UNAUTHORIZED });
      expect(socket.connected).toBe(false);
    });

    it.each([
      ['an empty token', ''],
      ['a malformed token', 'not.a.jwt'],
      ['a number', 42],
    ])('rejects %s', async (_label, token) => {
      const { error, socket } = await connectExpectingError(app, { auth: { token } });
      expect(error.message).toBe(REALTIME_UNAUTHORIZED);
      expect(socket.connected).toBe(false);
    });

    it('rejects a token signed with another secret', async () => {
      const user = await createUser(app);
      const forged = await new JwtService({ secret: 'x'.repeat(48) }).signAsync(
        { sub: user.user.id, email: user.user.email },
        { expiresIn: 900 },
      );
      const { error } = await connectExpectingError(app, { auth: { token: forged } });
      expect(error.message).toBe(REALTIME_UNAUTHORIZED);
    });

    it('rejects an expired token', async () => {
      const user = await createUser(app);
      const expired = await app
        .get(JwtService, { strict: false })
        .signAsync({ sub: user.user.id, email: user.user.email }, { expiresIn: -60 });
      const { error } = await connectExpectingError(app, { auth: { token: expired } });
      expect(error.message).toBe(REALTIME_UNAUTHORIZED);
    });

    it('does not read the token from the query string', async () => {
      const user = await createUser(app);
      const { error } = await connectExpectingError(app, { query: { token: tokenOf(user) } });
      expect(error.message).toBe(REALTIME_UNAUTHORIZED);
    });

    it('accepts a valid token and puts the socket into the room of its user', async () => {
      const user = await createUser(app);
      const socket = await connectAs(app, user);
      const events = recordEvents(socket);
      expect(socket.connected).toBe(true);

      app.get(RealtimeService).toUsers([user.user.id], MISSING_ID, { actorId: user.user.id, socketId: null }, {
        type: 'board:deleted',
        data: { boardId: MISSING_ID },
      });

      const envelope = await expectNext(events, 'board:deleted');
      expect(envelope).toMatchObject({
        boardId: MISSING_ID,
        actorId: user.user.id,
        data: { boardId: MISSING_ID },
      });
      expect(new Date(envelope.emittedAt).toISOString()).toBe(envelope.emittedAt);
    });

    it('closes the socket from the server side when its token expires', async () => {
      const user = await createUser(app);
      const shortLived = await app
        .get(JwtService, { strict: false })
        .signAsync({ sub: user.user.id, email: user.user.email }, { expiresIn: 1 });
      const socket = await connectAs(app, shortLived);

      const reason = await new Promise<string>((resolve) => {
        socket.once('disconnect', resolve);
      });

      expect(reason).toBe('io server disconnect');
      expect(socket.connected).toBe(false);
    });

    it('gives the default namespace no handlers', async () => {
      const user = await createUser(app);
      const board = await createBoard(app, user);
      const socket = await connectToDefaultNamespace(app);
      const events = recordEvents(socket);

      await expect(
        (socket as unknown as { timeout(ms: number): { emitWithAck(e: string, b: unknown): Promise<unknown> } })
          .timeout(300)
          .emitWithAck('board:join', { boardId: board }),
      ).rejects.toThrow();
      expect(events.events).toHaveLength(0);
    });
  });

  describe('guard assumptions (plan 4.10)', () => {
    it('runs the global guards for gateway handlers, and they let a joined member through', async () => {
      const jwtGuard = vi.spyOn(JwtAuthGuard.prototype, 'canActivate');
      const throttler = vi.spyOn(ThrottlerGuard.prototype, 'canActivate');
      const user = await createUser(app);
      const boardId = await createBoard(app, user);
      const socket = await connectAs(app, user);

      await expect(join(socket, boardId)).resolves.toEqual({ ok: true });

      const wsCall = jwtGuard.mock.calls.find(([context]) => context.getType() === 'ws');
      expect(wsCall).toBeDefined();
      const wsResults = jwtGuard.mock.results.filter(
        (_result, index) => jwtGuard.mock.calls[index]?.[0].getType() === 'ws',
      );
      await expect(Promise.all(wsResults.map((r) => r.value))).resolves.toEqual([true]);
      const throttlerWsResults = throttler.mock.results.filter(
        (_result, index) => throttler.mock.calls[index]?.[0].getType() === 'ws',
      );
      expect(throttlerWsResults).toHaveLength(1);
      await expect(Promise.all(throttlerWsResults.map((r) => r.value))).resolves.toEqual([true]);
    });

    it('does not rate limit gateway messages with the HTTP limit (300 per minute)', async () => {
      const user = await createUser(app);
      const boardId = await createBoard(app, user);
      const socket = await connectAs(app, user);

      let accepted = 0;
      for (let attempt = 0; attempt < 320; attempt += 1) {
        const ack = await join(socket, boardId);
        if (ack.ok) accepted += 1;
      }

      expect(accepted).toBe(320);
    }, 20_000);
  });

  describe('board:join', () => {
    it('lets a member in', async () => {
      const user = await createUser(app);
      const boardId = await createBoard(app, user);
      const socket = await connectAs(app, user);

      await expect(join(socket, boardId)).resolves.toEqual({ ok: true });
    });

    it('answers NOT_FOUND to a user who is not a member, and to a board that does not exist', async () => {
      const owner = await createUser(app, 'Sahip');
      const stranger = await createUser(app, 'Yabancı');
      const boardId = await createBoard(app, owner);
      const socket = await connectAs(app, stranger);

      await expect(join(socket, boardId)).resolves.toEqual({ ok: false, code: ErrorCode.NOT_FOUND });
      await expect(join(socket, MISSING_ID)).resolves.toEqual({ ok: false, code: ErrorCode.NOT_FOUND });
    });

    it.each([
      ['a boardId that is not a UUID', [{ boardId: 'abc' }]],
      ['no body', []],
      ['a numeric boardId', [{ boardId: 1 }]],
      ['a string body', ['abc']],
    ])('answers VALIDATION_FAILED to %s', async (_label, body) => {
      const user = await createUser(app);
      const socket = await connectAs(app, user);

      await expect(joinRaw(socket, ...body)).resolves.toEqual({
        ok: false,
        code: ErrorCode.VALIDATION_FAILED,
      });
    });

    it('keeps a rejected user out of the room: they never get the board events', async () => {
      const owner = await createUser(app, 'Sahip');
      const stranger = await createUser(app, 'Yabancı');
      const boardId = await createBoard(app, owner);
      const socket = await connectAs(app, stranger);
      const events = recordEvents(socket);

      await join(socket, boardId);
      sendToBoard(boardId, owner.user.id);
      sendSentinel(app, stranger.user.id);

      await expectNextAfterSentinel(events);
    });

    it('lets a member receive the events of the board', async () => {
      const owner = await createUser(app, 'Sahip');
      const boardId = await createBoard(app, owner);
      const socket = await connectAs(app, owner);
      const events = recordEvents(socket);
      await join(socket, boardId);

      sendToBoard(boardId, owner.user.id);

      const envelope = await expectNext(events, 'list:deleted');
      expect(envelope).toMatchObject({ boardId, actorId: owner.user.id, data: { id: 'x' } });
    });

    it('keeps a socket in one board room: joining board 2 leaves board 1', async () => {
      const user = await createUser(app);
      const board1 = await createBoard(app, user, 'Bir');
      const board2 = await createBoard(app, user, 'İki');
      const socket = await connectAs(app, user);
      const events = recordEvents(socket);

      await join(socket, board1);
      await join(socket, board2);
      sendToBoard(board1, user.user.id);
      sendToBoard(board2, user.user.id);

      const envelope = await expectNext(events, 'list:deleted');
      expect(envelope.boardId).toBe(board2);
      sendSentinel(app, user.user.id);
      await expectNextAfterSentinel(events);
    });

    it('stops the events after board:leave', async () => {
      const user = await createUser(app);
      const boardId = await createBoard(app, user);
      const socket = await connectAs(app, user);
      const events = recordEvents(socket);
      await join(socket, boardId);

      await leave(socket, boardId);
      sendToBoard(boardId, user.user.id);
      sendSentinel(app, user.user.id);

      await expectNextAfterSentinel(events);
    });

    it('does not let a stale join win over a newer one (CONFLICT, no room)', async () => {
      const user = await createUser(app);
      const board1 = await createBoard(app, user, 'Bir');
      const board2 = await createBoard(app, user, 'İki');
      const socket = await connectAs(app, user);
      const events = recordEvents(socket);

      const [first, second] = await Promise.all([join(socket, board1), join(socket, board2)]);

      expect(second).toEqual({ ok: true });
      expect(first).toEqual({ ok: false, code: ErrorCode.CONFLICT });
      sendToBoard(board1, user.user.id);
      sendToBoard(board2, user.user.id);
      const envelope = await expectNext(events, 'list:deleted');
      expect(envelope.boardId).toBe(board2);
      sendSentinel(app, user.user.id);
      await expectNextAfterSentinel(events);
    });
  });

  describe('broadcast and exclusion', () => {
    /** The watchers that must all see a card:moved followed by its activity:created, in the order of the sockets given. */
    async function expectMoved(
      world: World,
      watchers: readonly Watcher[],
      moved: ExpectedEvent<'card:moved'>,
    ): Promise<void> {
      const row = await app.get(PrismaService).activity.findFirstOrThrow({
        where: { cardId: moved.data.id, type: 'CARD_MOVED' },
        select: ACTIVITY_SELECT,
      });
      const activity = event('activity:created', toActivityDto(row));
      sendSentinels(app, [world.a, world.b, world.c]);
      for (const watcher of watchers) {
        await expectReceived(watcher, [moved, activity], {
          boardId: world.boardId,
          actorId: world.a.user.id,
        });
      }
    }

    it('sends a change to the other members and the sender\'s other tab, not to the sending socket or another board', async () => {
      const world = await createWorld(app);

      const res = await api(app, world.a, world.a1.socket)
        .post(`/cards/${world.card1.id}/move`)
        .send({ listId: world.list2.id })
        .expect(200);

      const moved = event('card:moved', {
        id: world.card1.id,
        fromListId: world.list1.id,
        toListId: world.list2.id,
        position: (res.body as { position: number }).position,
      });
      expect(res.body).toEqual({
        id: moved.data.id,
        listId: moved.data.toListId,
        position: moved.data.position,
        rebalanced: null,
      });
      await expectMoved(world, [world.b1, world.a2], moved);
      await expectNothing(world.a1);
      await expectNothing(world.c1);
    });

    it('also sends the change to the sender when the request names no socket', async () => {
      const world = await createWorld(app);

      const res = await api(app, world.a)
        .post(`/cards/${world.card1.id}/move`)
        .send({ listId: world.list2.id })
        .expect(200);

      const position = (res.body as { position: number }).position;
      await expectMoved(world, [world.a1, world.a2, world.b1], event('card:moved', {
        id: world.card1.id,
        fromListId: world.list1.id,
        toListId: world.list2.id,
        position,
      }));
    });

    it('does not let a user mute another user\'s socket with its id', async () => {
      const world = await createWorld(app);

      const res = await api(app, world.a, world.b1.socket)
        .post(`/cards/${world.card1.id}/move`)
        .send({ listId: world.list2.id })
        .expect(200);

      await expectMoved(world, [world.a1, world.a2, world.b1], event('card:moved', {
        id: world.card1.id,
        fromListId: world.list1.id,
        toListId: world.list2.id,
        position: (res.body as { position: number }).position,
      }));
    });

    it.each([
      ['500 characters', 'x'.repeat(500)],
      ['a space', 'a b'],
      ['an unknown socket', 'AAAAAAAAAAAAAAAAAAAA'],
    ])('ignores an X-Socket-Id of %s', async (_label, header) => {
      const world = await createWorld(app);

      const res = await api(app, world.a)
        .post(`/cards/${world.card1.id}/move`)
        .set(SOCKET_ID_HEADER, header)
        .send({ listId: world.list2.id })
        .expect(200);

      await expectMoved(world, [world.a1, world.a2, world.b1], event('card:moved', {
        id: world.card1.id,
        fromListId: world.list1.id,
        toListId: world.list2.id,
        position: (res.body as { position: number }).position,
      }));
    });

    it('sends nothing for a request that fails', async () => {
      const world = await createWorld(app);
      const foreignList = await app.get(PrismaService).list.create({
        data: { boardId: world.otherBoardId, title: 'Yabancı', position: 1024 },
      });
      const foreignCard = await app.get(PrismaService).card.create({
        data: { boardId: world.otherBoardId, listId: foreignList.id, title: 'Yabancı', position: 1024 },
      });
      const asA = api(app, world.a, world.a1.socket);
      const asB = api(app, world.b, world.b1.socket);

      await asA.post(`/lists/${world.list1.id}/cards`).send({ title: '' }).expect(400);
      await asB.delete(`/lists/${world.list1.id}`).expect(403);
      await asA.patch(`/cards/${foreignCard.id}`).send({ title: 'Ele geçir' }).expect(404);
      await asA
        .post(`/cards/${world.card1.id}/move`)
        .send({ listId: world.list2.id, afterCardId: world.card2.id })
        .expect(409);

      sendSentinels(app, [world.a, world.b, world.c]);
      for (const watcher of [world.a1, world.a2, world.b1, world.c1]) {
        await expectNothing(watcher);
      }
    });
  });

  describe('membership', () => {
    it('takes a removed member out of the board: tabs are told, later writes are not delivered, joining fails', async () => {
      const world = await createWorld(app);
      const context = { boardId: world.boardId, actorId: world.a.user.id };

      await api(app, world.a, world.a1.socket)
        .delete(`/boards/${world.boardId}/members/${world.b.user.id}`)
        .expect(204);
      sendSentinels(app, [world.a, world.b]);

      await expectReceived(world.b1, [event('membership:removed', { boardId: world.boardId })], context);
      await expectReceived(world.a2, [event('member:removed', { userId: world.b.user.id })], context);
      await expectNothing(world.a1);

      await api(app, world.a, world.a1.socket)
        .patch(`/lists/${world.list1.id}`)
        .send({ title: 'Sonraki yazım' })
        .expect(200);
      sendSentinels(app, [world.a, world.b]);

      await expectReceived(
        world.a2,
        [event('list:updated', expect.objectContaining({ title: 'Sonraki yazım' }))],
        context,
      );
      await expectNothing(world.b1);
      await expect(join(world.b1.socket, world.boardId)).resolves.toEqual({
        ok: false,
        code: ErrorCode.NOT_FOUND,
      });
    });

    it('takes every tab of a removed member out of the board, not only the first', async () => {
      const world = await createWorld(app);
      const b2 = await watch(app, world.b, world.boardId);
      const context = { boardId: world.boardId, actorId: world.a.user.id };

      await api(app, world.a, world.a1.socket)
        .delete(`/boards/${world.boardId}/members/${world.b.user.id}`)
        .expect(204);
      sendSentinels(app, [world.a, world.b]);
      const removed = [event('membership:removed', { boardId: world.boardId })];
      await expectReceived(world.b1, removed, context);
      await expectReceived(b2, removed, context);

      await api(app, world.a, world.a1.socket)
        .patch(`/lists/${world.list1.id}`)
        .send({ title: 'Sonraki yazım' })
        .expect(200);
      sendSentinels(app, [world.a, world.b]);

      await expectNothing(world.b1);
      await expectNothing(b2);
      await expect(join(b2.socket, world.boardId)).resolves.toEqual({
        ok: false,
        code: ErrorCode.NOT_FOUND,
      });
    });

    it('sends nothing for invitation requests that fail', async () => {
      const world = await createWorld(app);

      await api(app, world.a, world.a1.socket)
        .post(`/boards/${world.boardId}/invitations`)
        .send({ email: world.b.user.email, role: 'MEMBER' })
        .expect(409);
      await api(app, world.b, world.b1.socket)
        .post(`/boards/${world.boardId}/invitations`)
        .send({ email: world.d.user.email, role: 'MEMBER' })
        .expect(403);
      await api(app, world.a, world.a1.socket)
        .post(`/boards/${world.boardId}/invitations`)
        .send({ email: 'not-an-email', role: 'MEMBER' })
        .expect(400);
      await api(app, world.a, world.a1.socket)
        .delete(`/boards/${world.boardId}/invitations/${MISSING_ID}`)
        .expect(404);
      sendSentinels(app, [world.a, world.b, world.c, world.d]);

      for (const watcher of [world.a1, world.a2, world.b1, world.c1, world.d1, world.d2]) {
        await expectNothing(watcher);
      }
    });

    it('tells the other tabs of a member who leaves, not the tab that sent the request', async () => {
      const world = await createWorld(app);
      const b2 = await watch(app, world.b, world.boardId);
      const context = { boardId: world.boardId, actorId: world.b.user.id };

      await api(app, world.b, world.b1.socket)
        .delete(`/boards/${world.boardId}/members/${world.b.user.id}`)
        .expect(204);
      sendSentinels(app, [world.a, world.b]);

      await expectReceived(b2, [event('membership:removed', { boardId: world.boardId })], context);
      await expectNothing(world.b1);
      const memberRemoved = [event('member:removed', { userId: world.b.user.id })];
      await expectReceived(world.a1, memberRemoved, context);
      await expectReceived(world.a2, memberRemoved, context);
    });

    it('sends a member:updated that has exactly the fields of a MemberDto', async () => {
      const world = await createWorld(app);

      await api(app, world.a, world.a1.socket)
        .patch(`/boards/${world.boardId}/members/${world.b.user.id}`)
        .send({ role: 'ADMIN' })
        .expect(200);

      const envelope = await expectNext(world.b1.events, 'member:updated');
      expect(Object.keys(envelope.data).sort()).toEqual(
        ['avatarUrl', 'email', 'joinedAt', 'name', 'role', 'userId'],
      );
      expect(envelope.data).toMatchObject({ userId: world.b.user.id, role: 'ADMIN' });
      expect(envelope.actorId).toBe(world.a.user.id);
    });

    it('does not announce an accepted invitation a second time', async () => {
      const world = await createWorld(app);
      const token = newOpaqueToken();
      await app.get(PrismaService).invitation.create({
        data: {
          boardId: world.boardId,
          email: world.d.user.email,
          role: 'MEMBER',
          tokenHash: hashToken(token),
          invitedById: world.a.user.id,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
      const asD = api(app, world.d, world.d1.socket);

      await asD.post(`/invitations/${token}/accept`).send({}).expect(200);
      await expectNext(world.b1.events, 'member:added');
      await expectNext(world.d2.events, 'membership:added');

      await asD.post(`/invitations/${token}/accept`).send({}).expect(200);
      sendSentinels(app, [world.a, world.b, world.d]);

      await expectNothing(world.b1);
      await expectNothing(world.d2);
    });

    it('tells every member about a deleted board, even tabs that never joined it, and then closes the room', async () => {
      const world = await createWorld(app);
      const b2 = await watch(app, world.b, null);
      const context = { boardId: world.boardId, actorId: world.a.user.id };
      const deleted = [event('board:deleted', { boardId: world.boardId })];

      await api(app, world.a, world.a1.socket).delete(`/boards/${world.boardId}`).expect(204);
      sendSentinels(app, [world.a, world.b, world.c]);

      await expectReceived(world.b1, deleted, context);
      await expectReceived(b2, deleted, context);
      await expectReceived(world.a2, deleted, context);
      await expectNothing(world.a1);
      await expectNothing(world.c1);

      sendToBoard(world.boardId, world.a.user.id);
      sendSentinels(app, [world.a, world.b]);
      await expectNothing(world.b1);
      await expectNothing(world.a2);
    });

    it('does not tell the board when a board is created, only the creator\'s other tabs', async () => {
      const world = await createWorld(app);

      const res = await api(app, world.a, world.a1.socket)
        .post('/boards')
        .send({ title: 'Yeni' })
        .expect(201);
      sendSentinels(app, [world.a, world.b, world.c]);

      const envelope = await expectNext(world.a2.events, 'membership:added');
      expect(envelope.data).toEqual(res.body);
      expect(envelope.boardId).toBe((res.body as { id: string }).id);
      await expectNothing(world.a1);
      await expectNothing(world.b1);
      await expectNothing(world.c1);
    });
  });
});
