import type { Prisma } from '../generated/prisma/client.js';
import { ActivityService, activityEvents } from './activity.service.js';

const REF = { boardId: 'b1', cardId: 'c1', actorId: 'u1' };

function setup() {
  let count = 0;
  const create = vi.fn(
    ({ data }: { data: { cardId: string; actorId: string; type: string; data: unknown } }) => {
      count += 1;
      return Promise.resolve({
        id: `a${count}`,
        cardId: data.cardId,
        type: data.type,
        data: data.data,
        createdAt: new Date('2026-11-05T10:00:00.000Z'),
        actor: { id: data.actorId, name: 'Ayşe', avatarUrl: null },
      });
    },
  );
  const tx = { activity: { create } } as unknown as Prisma.TransactionClient;
  return { tx, create, service: new ActivityService() };
}

describe('ActivityService.record', () => {
  it('writes nothing for no entries', async () => {
    const { service, tx, create } = setup();

    await expect(service.record(tx, REF, [])).resolves.toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });

  it('writes each entry in order with board, card and actor, and returns ready DTOs', async () => {
    const { service, tx, create } = setup();

    const result = await service.record(tx, REF, [
      { type: 'CARD_RESTORED', data: { cardTitle: 'Kart' } },
      { type: 'CARD_COMPLETED', data: { cardTitle: 'Kart' } },
    ]);

    expect(create.mock.calls.map(([arg]) => arg.data)).toEqual([
      { ...REF, type: 'CARD_RESTORED', data: { cardTitle: 'Kart' } },
      { ...REF, type: 'CARD_COMPLETED', data: { cardTitle: 'Kart' } },
    ]);
    expect(result).toEqual([
      {
        kind: 'activity',
        id: 'a1',
        cardId: 'c1',
        actor: { id: 'u1', name: 'Ayşe', avatarUrl: null },
        createdAt: '2026-11-05T10:00:00.000Z',
        type: 'CARD_RESTORED',
        data: { cardTitle: 'Kart' },
      },
      expect.objectContaining({ id: 'a2', type: 'CARD_COMPLETED' }),
    ]);
  });

  it('selects the actor without the e-mail address', async () => {
    const { service, tx, create } = setup();

    await service.record(tx, REF, [{ type: 'CARD_ARCHIVED', data: { cardTitle: 'Kart' } }]);

    expect(create.mock.calls[0][0]).toMatchObject({
      select: { actor: { select: { id: true, name: true, avatarUrl: true } } },
    });
  });
});

describe('activityEvents', () => {
  it('wraps each entry as an activity:created event, in order', async () => {
    const { service, tx } = setup();
    const recorded = await service.record(tx, REF, [
      { type: 'CARD_ARCHIVED', data: { cardTitle: 'Kart' } },
      { type: 'CARD_COMPLETED', data: { cardTitle: 'Kart' } },
    ]);

    expect(activityEvents(recorded)).toEqual(
      recorded.map((activity) => ({ type: 'activity:created', data: activity })),
    );
    expect(activityEvents([])).toEqual([]);
  });
});
