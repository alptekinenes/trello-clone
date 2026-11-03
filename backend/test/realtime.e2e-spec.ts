import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ErrorCode, REALTIME_UNAUTHORIZED } from '@trello/contracts';
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
});
