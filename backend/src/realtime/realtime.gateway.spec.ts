import { Logger } from '@nestjs/common';
import { ErrorCode } from '@trello/contracts';
import type { BoardAccessService } from '../access/board-access.service.js';
import type { TokenService } from '../auth/token.service.js';
import { RealtimeGateway } from './realtime.gateway.js';
import type { RealtimeService } from './realtime.service.js';
import type { RealtimeNamespace, RealtimeSocket } from './realtime.types.js';

const USER = { id: 'user-1', email: 'ayse@example.com' };
const BOARD_A = '11111111-1111-4111-8111-111111111111';
const BOARD_B = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-11-03T12:00:00.000Z');

function createSocket(expiresAt = NOW.getTime() + 60_000) {
  const rooms = new Set<string>(['socket-1']);
  const socket = {
    id: 'socket-1',
    rooms,
    data: { user: USER, expiresAt, roomSeq: 0 },
    join: vi.fn((room: string) => {
      rooms.add(room);
    }),
    leave: vi.fn((room: string) => {
      rooms.delete(room);
    }),
    disconnect: vi.fn(),
  };
  return { socket, typed: socket as unknown as RealtimeSocket, rooms };
}

function setup() {
  const tokens = { verifyAccessTokenWithExpiry: vi.fn() };
  const access = { getRole: vi.fn().mockResolvedValue('MEMBER') };
  const realtime = { attach: vi.fn() };
  const gateway = new RealtimeGateway(
    tokens as unknown as TokenService,
    access as unknown as BoardAccessService,
    realtime as unknown as RealtimeService,
  );
  return { gateway, tokens, access, realtime };
}

describe('RealtimeGateway', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('afterInit', () => {
    it('installs the auth middleware and hands the namespace to the service', () => {
      const { gateway, realtime } = setup();
      const use = vi.fn();
      const namespace = { use } as unknown as RealtimeNamespace;

      gateway.afterInit(namespace);

      expect(use).toHaveBeenCalledOnce();
      expect(realtime.attach).toHaveBeenCalledWith(namespace);
    });
  });

  describe('connection', () => {
    it('puts the socket into the room of its user', () => {
      const { gateway } = setup();
      const { socket, typed } = createSocket();

      gateway.handleConnection(typed);

      expect(socket.join).toHaveBeenCalledWith('user:user-1');
    });

    it('disconnects the socket when its token expires', () => {
      const { gateway } = setup();
      const { socket, typed } = createSocket(NOW.getTime() + 5_000);
      gateway.handleConnection(typed);

      vi.advanceTimersByTime(4_999);
      expect(socket.disconnect).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('disconnects at once when the token has already expired', () => {
      const { gateway } = setup();
      const { socket, typed } = createSocket(NOW.getTime() - 1_000);
      gateway.handleConnection(typed);

      vi.advanceTimersByTime(0);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('clears the timer when the socket disconnects', () => {
      const { gateway } = setup();
      const { socket, typed } = createSocket(NOW.getTime() + 5_000);
      gateway.handleConnection(typed);

      gateway.handleDisconnect(typed);
      vi.advanceTimersByTime(10_000);

      expect(socket.disconnect).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('joinBoard', () => {
    it.each([
      ['no body', undefined],
      ['null', null],
      ['a string', BOARD_A],
      ['no boardId', {}],
      ['a numeric boardId', { boardId: 1 }],
      ['a boardId that is not a UUID', { boardId: 'abc' }],
      ['a boardId with a NUL', { boardId: `${BOARD_A}\u0000` }],
    ])('rejects %s as invalid', async (_label, body) => {
      const { gateway, access } = setup();
      const { socket, typed } = createSocket();

      await expect(gateway.joinBoard(typed, body)).resolves.toEqual({
        ok: false,
        code: ErrorCode.VALIDATION_FAILED,
      });

      expect(access.getRole).not.toHaveBeenCalled();
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('answers NOT_FOUND to a non-member and does not join the room', async () => {
      const { gateway, access } = setup();
      access.getRole.mockResolvedValue(null);
      const { socket, typed } = createSocket();

      await expect(gateway.joinBoard(typed, { boardId: BOARD_A })).resolves.toEqual({
        ok: false,
        code: ErrorCode.NOT_FOUND,
      });

      expect(access.getRole).toHaveBeenCalledWith(BOARD_A, USER.id);
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('joins the board room of a member', async () => {
      const { gateway } = setup();
      const { socket, typed, rooms } = createSocket();

      await expect(gateway.joinBoard(typed, { boardId: BOARD_A })).resolves.toEqual({ ok: true });

      expect(socket.join).toHaveBeenCalledWith(`board:${BOARD_A}`);
      expect(rooms.has(`board:${BOARD_A}`)).toBe(true);
    });

    it('leaves the other board rooms but keeps the user room and its own id room', async () => {
      const { gateway } = setup();
      const { socket, typed, rooms } = createSocket();
      rooms.add('user:user-1');
      rooms.add(`board:${BOARD_A}`);

      await gateway.joinBoard(typed, { boardId: BOARD_B });

      expect(socket.leave).toHaveBeenCalledTimes(1);
      expect(socket.leave).toHaveBeenCalledWith(`board:${BOARD_A}`);
      expect([...rooms].sort()).toEqual(['socket-1', 'user:user-1', `board:${BOARD_B}`].sort());
    });

    it('stays in the room when it joins the same board again', async () => {
      const { gateway } = setup();
      const { socket, typed, rooms } = createSocket();
      rooms.add(`board:${BOARD_A}`);

      await expect(gateway.joinBoard(typed, { boardId: BOARD_A })).resolves.toEqual({ ok: true });

      expect(socket.leave).not.toHaveBeenCalled();
      expect(rooms.has(`board:${BOARD_A}`)).toBe(true);
    });

    it('answers CONFLICT and stays out when a newer join came in meanwhile', async () => {
      const { gateway, access } = setup();
      const { socket, typed } = createSocket();
      let releaseFirst: (role: string) => void = () => undefined;
      access.getRole.mockImplementationOnce(
        () => new Promise<string>((resolve) => (releaseFirst = resolve)),
      );

      const first = gateway.joinBoard(typed, { boardId: BOARD_A });
      const second = gateway.joinBoard(typed, { boardId: BOARD_B });
      await expect(second).resolves.toEqual({ ok: true });
      releaseFirst('MEMBER');

      await expect(first).resolves.toEqual({ ok: false, code: ErrorCode.CONFLICT });
      expect(socket.join).toHaveBeenCalledTimes(1);
      expect(socket.join).toHaveBeenCalledWith(`board:${BOARD_B}`);
    });

    it('answers CONFLICT when a leave came in meanwhile', async () => {
      const { gateway, access } = setup();
      const { socket, typed } = createSocket();
      let release: (role: string) => void = () => undefined;
      access.getRole.mockImplementationOnce(
        () => new Promise<string>((resolve) => (release = resolve)),
      );

      const join = gateway.joinBoard(typed, { boardId: BOARD_A });
      gateway.leaveBoard(typed, { boardId: BOARD_A });
      release('MEMBER');

      await expect(join).resolves.toEqual({ ok: false, code: ErrorCode.CONFLICT });
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('checks again after joining and leaves when the member was removed meanwhile', async () => {
      const { gateway, access } = setup();
      access.getRole.mockResolvedValueOnce('MEMBER').mockResolvedValueOnce(null);
      const { socket, typed, rooms } = createSocket();

      await expect(gateway.joinBoard(typed, { boardId: BOARD_A })).resolves.toEqual({
        ok: false,
        code: ErrorCode.NOT_FOUND,
      });

      expect(access.getRole).toHaveBeenCalledTimes(2);
      expect(socket.join).toHaveBeenCalledWith(`board:${BOARD_A}`);
      expect(socket.leave).toHaveBeenCalledWith(`board:${BOARD_A}`);
      expect(rooms.has(`board:${BOARD_A}`)).toBe(false);
    });

    it('answers INTERNAL_ERROR without throwing when the lookup fails', async () => {
      const { gateway, access } = setup();
      access.getRole.mockRejectedValue(new Error('db down'));
      const { socket, typed } = createSocket();

      await expect(gateway.joinBoard(typed, { boardId: BOARD_A })).resolves.toEqual({
        ok: false,
        code: ErrorCode.INTERNAL_ERROR,
      });
      expect(socket.join).not.toHaveBeenCalledWith(`board:${BOARD_A}`);
    });

    it('takes the socket out of the room again when the recheck fails', async () => {
      const { gateway, access } = setup();
      access.getRole.mockResolvedValueOnce('MEMBER').mockRejectedValueOnce(new Error('db down'));
      const { socket, typed, rooms } = createSocket();

      await expect(gateway.joinBoard(typed, { boardId: BOARD_A })).resolves.toEqual({
        ok: false,
        code: ErrorCode.INTERNAL_ERROR,
      });

      expect(socket.leave).toHaveBeenCalledWith(`board:${BOARD_A}`);
      expect(rooms.has(`board:${BOARD_A}`)).toBe(false);
    });
  });

  describe('leaveBoard', () => {
    it('leaves the board room and acknowledges', () => {
      const { gateway } = setup();
      const { socket, typed } = createSocket();

      expect(gateway.leaveBoard(typed, { boardId: BOARD_A })).toEqual({ ok: true });

      expect(socket.leave).toHaveBeenCalledWith(`board:${BOARD_A}`);
    });

    it('counts as a room change', () => {
      const { gateway } = setup();
      const { socket, typed } = createSocket();

      gateway.leaveBoard(typed, { boardId: BOARD_A });

      expect(socket.data.roomSeq).toBe(1);
    });

    it.each([
      ['no body', undefined],
      ['a bad boardId', { boardId: 'abc' }],
      ['a numeric boardId', { boardId: 7 }],
    ])('ignores %s without an ack', (_label, body) => {
      const { gateway } = setup();
      const { socket, typed } = createSocket();

      expect(gateway.leaveBoard(typed, body)).toBeUndefined();

      expect(socket.leave).not.toHaveBeenCalled();
    });
  });
});
