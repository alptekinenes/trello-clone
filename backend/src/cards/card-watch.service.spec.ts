import type { PrismaService } from '../prisma/prisma.service.js';
import type { EventOrigin } from '../realtime/event-origin.js';
import type { RealtimeService } from '../realtime/realtime.service.js';
import { CardWatchService } from './card-watch.service.js';

const BOARD = 'board-1';
const CARD = 'card-1';
const USER = 'user-1';
const ORIGIN: EventOrigin = { actorId: USER, socketId: 'socket-1' };

function setup({ created = 1, deleted = 1 } = {}) {
  const cardWatch = {
    createMany: vi.fn().mockResolvedValue({ count: created }),
    deleteMany: vi.fn().mockResolvedValue({ count: deleted }),
  };
  const realtime = { toBoard: vi.fn(), toUsers: vi.fn() };
  const service = new CardWatchService(
    { cardWatch } as unknown as PrismaService,
    realtime as unknown as RealtimeService,
  );
  return { service, realtime, cardWatch };
}

describe('CardWatchService', () => {
  it('watches for the user and tells only that user', async () => {
    const { service, realtime, cardWatch } = setup();

    await service.watch(BOARD, CARD, USER, ORIGIN);

    expect(cardWatch.createMany).toHaveBeenCalledWith({
      data: [{ cardId: CARD, boardId: BOARD, userId: USER }],
      skipDuplicates: true,
    });
    expect(realtime.toUsers).toHaveBeenCalledWith([USER], BOARD, ORIGIN, {
      type: 'card:watch-updated',
      data: { cardId: CARD, watching: true },
    });
    expect(realtime.toBoard).not.toHaveBeenCalled();
  });

  it('sends nothing when already watching', async () => {
    const { service, realtime } = setup({ created: 0 });

    await service.watch(BOARD, CARD, USER, ORIGIN);

    expect(realtime.toUsers).not.toHaveBeenCalled();
  });

  it('unwatches only the own row and tells only that user', async () => {
    const { service, realtime, cardWatch } = setup();

    await service.unwatch(BOARD, CARD, USER, ORIGIN);

    expect(cardWatch.deleteMany).toHaveBeenCalledWith({
      where: { cardId: CARD, boardId: BOARD, userId: USER },
    });
    expect(realtime.toUsers).toHaveBeenCalledWith([USER], BOARD, ORIGIN, {
      type: 'card:watch-updated',
      data: { cardId: CARD, watching: false },
    });
    expect(realtime.toBoard).not.toHaveBeenCalled();
  });

  it('sends nothing when it was not watched', async () => {
    const { service, realtime } = setup({ deleted: 0 });

    await service.unwatch(BOARD, CARD, USER, ORIGIN);

    expect(realtime.toUsers).not.toHaveBeenCalled();
  });
});
