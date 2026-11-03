import { Logger } from '@nestjs/common';
import type { BoardEvent, UserEvent } from '@trello/contracts';
import { RealtimeService } from './realtime.service.js';
import type { RealtimeNamespace } from './realtime.types.js';

const BOARD_ID = 'board-1';
const ACTOR_ID = 'user-1';
const NOW = new Date('2026-11-03T12:00:00.000Z');

const LIST_CREATED: BoardEvent = {
  type: 'list:created',
  data: { id: 'list-1', boardId: BOARD_ID, title: 'Yapılacaklar', position: 1024, archivedAt: null },
};
const LIST_DELETED: BoardEvent = { type: 'list:deleted', data: { id: 'list-1' } };
const BOARD_DELETED: UserEvent = { type: 'board:deleted', data: { boardId: BOARD_ID } };

interface Broadcast {
  rooms: string | string[];
  except: string | null;
  emit: ReturnType<typeof vi.fn>;
}

function createNamespace(sockets: Record<string, string> = {}) {
  const broadcasts: Broadcast[] = [];
  const socketsLeave = vi.fn();
  const inRooms: string[] = [];
  const to = vi.fn((rooms: string | string[]) => {
    const broadcast: Broadcast = { rooms, except: null, emit: vi.fn().mockReturnValue(true) };
    broadcasts.push(broadcast);
    const operator = {
      except: (socketId: string) => {
        broadcast.except = socketId;
        return operator;
      },
      emit: broadcast.emit,
    };
    return operator;
  });
  const namespace = {
    sockets: new Map(Object.entries(sockets).map(([id, userId]) => [id, { data: { user: { id: userId } } }])),
    to,
    in: vi.fn((room: string) => {
      inRooms.push(room);
      return { socketsLeave };
    }),
  };
  return { namespace: namespace as unknown as RealtimeNamespace, to, broadcasts, socketsLeave, inRooms };
}

function setup(sockets: Record<string, string> = {}) {
  const service = new RealtimeService();
  const mocks = createNamespace(sockets);
  service.attach(mocks.namespace);
  return { service, ...mocks };
}

describe('RealtimeService', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does nothing before a namespace is attached', () => {
    const service = new RealtimeService();
    const origin = { actorId: ACTOR_ID, socketId: null };

    expect(() => {
      service.toBoard(BOARD_ID, origin, [LIST_CREATED]);
      service.toUsers(['user-2'], BOARD_ID, origin, BOARD_DELETED);
      service.removeUserFromBoard(BOARD_ID, 'user-2');
      service.closeBoardRoom(BOARD_ID);
    }).not.toThrow();
  });

  describe('toBoard', () => {
    it('sends the events to the board room in array order, each in an envelope', () => {
      const { service, broadcasts } = setup();

      service.toBoard(BOARD_ID, { actorId: ACTOR_ID, socketId: null }, [LIST_CREATED, LIST_DELETED]);

      expect(broadcasts.map((b) => b.rooms)).toEqual(['board:board-1', 'board:board-1']);
      const envelope = {
        boardId: BOARD_ID,
        actorId: ACTOR_ID,
        emittedAt: NOW.toISOString(),
      };
      expect(broadcasts[0]?.emit).toHaveBeenCalledWith('list:created', {
        ...envelope,
        data: LIST_CREATED.data,
      });
      expect(broadcasts[1]?.emit).toHaveBeenCalledWith('list:deleted', {
        ...envelope,
        data: LIST_DELETED.data,
      });
    });

    it('sends nothing for an empty event list', () => {
      const { service, broadcasts } = setup();
      service.toBoard(BOARD_ID, { actorId: ACTOR_ID, socketId: null }, []);
      expect(broadcasts).toHaveLength(0);
    });

    it('leaves out the socket of the requester', () => {
      const { service, broadcasts } = setup({ 'sock-a1': ACTOR_ID });

      service.toBoard(BOARD_ID, { actorId: ACTOR_ID, socketId: 'sock-a1' }, [LIST_CREATED]);

      expect(broadcasts[0]?.except).toBe('sock-a1');
    });

    it('does not leave out a socket that belongs to someone else', () => {
      const { service, broadcasts } = setup({ 'sock-b1': 'user-2' });

      service.toBoard(BOARD_ID, { actorId: ACTOR_ID, socketId: 'sock-b1' }, [LIST_CREATED]);

      expect(broadcasts[0]?.except).toBeNull();
    });

    it('does not leave out an unknown socket id', () => {
      const { service, broadcasts } = setup({ 'sock-a1': ACTOR_ID });

      service.toBoard(BOARD_ID, { actorId: ACTOR_ID, socketId: 'gone' }, [LIST_CREATED]);

      expect(broadcasts[0]?.except).toBeNull();
    });

    it('does not rethrow a failing emit, logs it without the payload, and sends the next event', () => {
      const { service, broadcasts, to } = setup();
      const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      to.mockImplementationOnce(() => {
        throw new Error('socket closed');
      });

      expect(() =>
        service.toBoard(BOARD_ID, { actorId: ACTOR_ID, socketId: null }, [LIST_CREATED, LIST_DELETED]),
      ).not.toThrow();

      expect(error).toHaveBeenCalledOnce();
      const message = String(error.mock.calls[0]?.[0]);
      expect(message).toContain('list:created');
      expect(message).toContain(BOARD_ID);
      expect(message).not.toContain('Yapılacaklar');
      expect(broadcasts).toHaveLength(1);
      expect(broadcasts[0]?.emit).toHaveBeenCalledWith('list:deleted', expect.anything());
    });
  });

  describe('toUsers', () => {
    it('sends one emit to the list of user rooms', () => {
      const { service, broadcasts } = setup();

      service.toUsers(['user-2', 'user-3'], BOARD_ID, { actorId: ACTOR_ID, socketId: null }, BOARD_DELETED);

      expect(broadcasts).toHaveLength(1);
      expect(broadcasts[0]?.rooms).toEqual(['user:user-2', 'user:user-3']);
      expect(broadcasts[0]?.emit).toHaveBeenCalledOnce();
      expect(broadcasts[0]?.emit).toHaveBeenCalledWith('board:deleted', {
        boardId: BOARD_ID,
        actorId: ACTOR_ID,
        emittedAt: NOW.toISOString(),
        data: { boardId: BOARD_ID },
      });
    });

    it('sends nothing to an empty list, which socket.io would read as everyone', () => {
      const { service, broadcasts, to } = setup();

      service.toUsers([], BOARD_ID, { actorId: ACTOR_ID, socketId: null }, BOARD_DELETED);

      expect(to).not.toHaveBeenCalled();
      expect(broadcasts).toHaveLength(0);
    });

    it('leaves out the socket of the requester only when it is theirs', () => {
      const { service, broadcasts } = setup({ 'sock-a1': ACTOR_ID, 'sock-b1': 'user-2' });

      service.toUsers([ACTOR_ID], BOARD_ID, { actorId: ACTOR_ID, socketId: 'sock-a1' }, BOARD_DELETED);
      service.toUsers([ACTOR_ID], BOARD_ID, { actorId: ACTOR_ID, socketId: 'sock-b1' }, BOARD_DELETED);

      expect(broadcasts.map((b) => b.except)).toEqual(['sock-a1', null]);
    });

    it('does not rethrow a failing emit', () => {
      const { service, to } = setup();
      const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      to.mockImplementation(() => {
        throw new Error('boom');
      });

      expect(() =>
        service.toUsers(['user-2'], BOARD_ID, { actorId: ACTOR_ID, socketId: null }, BOARD_DELETED),
      ).not.toThrow();
      expect(error).toHaveBeenCalledOnce();
    });
  });

  describe('room membership', () => {
    it('takes the sockets of a user out of one board room', () => {
      const { service, inRooms, socketsLeave } = setup();

      service.removeUserFromBoard(BOARD_ID, 'user-2');

      expect(inRooms).toEqual(['user:user-2']);
      expect(socketsLeave).toHaveBeenCalledWith('board:board-1');
    });

    it('empties a board room', () => {
      const { service, inRooms, socketsLeave } = setup();

      service.closeBoardRoom(BOARD_ID);

      expect(inRooms).toEqual(['board:board-1']);
      expect(socketsLeave).toHaveBeenCalledWith('board:board-1');
    });

    it('does not rethrow when the adapter fails', () => {
      const { service, socketsLeave } = setup();
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      socketsLeave.mockImplementation(() => {
        throw new Error('adapter down');
      });

      expect(() => service.removeUserFromBoard(BOARD_ID, 'user-2')).not.toThrow();
      expect(() => service.closeBoardRoom(BOARD_ID)).not.toThrow();
    });
  });
});
