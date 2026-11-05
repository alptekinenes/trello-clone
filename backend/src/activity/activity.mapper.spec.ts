import { ActivityType as ContractActivityType } from '@trello/contracts';
import { ActivityType as PrismaActivityType } from '../generated/prisma/enums.js';
import { type ActivityRow, toActivityDto } from './activity.mapper.js';

const ROW: ActivityRow = {
  id: 'a1',
  cardId: 'c1',
  type: 'CARD_MOVED',
  data: { cardTitle: 'Kart', fromList: { id: 'l1', title: 'A' }, toList: { id: 'l2', title: 'B' } },
  createdAt: new Date('2026-11-05T10:00:00.000Z'),
  actor: { id: 'u1', name: 'Ayşe', avatarUrl: null },
};

describe('toActivityDto', () => {
  it('maps a row and keeps the copied names', () => {
    expect(toActivityDto(ROW)).toEqual({
      kind: 'activity',
      id: 'a1',
      cardId: 'c1',
      actor: { id: 'u1', name: 'Ayşe', avatarUrl: null },
      createdAt: '2026-11-05T10:00:00.000Z',
      type: 'CARD_MOVED',
      data: ROW.data,
    });
  });

  it('never exposes more than the actor reference', () => {
    const dto = toActivityDto({
      ...ROW,
      actor: { id: 'u1', name: 'Ayşe', avatarUrl: 'https://x.test/a.png', email: 'a@x.test' } as ActivityRow['actor'],
    });
    expect(Object.keys(dto.actor).sort()).toEqual(['avatarUrl', 'id', 'name']);
  });

  it.each([
    ['null', null],
    ['an array', ['x']],
    ['a string', 'x'],
    ['an object without cardTitle', { list: 'x' }],
    ['a non-string cardTitle', { cardTitle: 1 }],
  ])('refuses data that is %s', (_name, data) => {
    expect(() => toActivityDto({ ...ROW, data })).toThrow(/unreadable/);
  });

  it('refuses an unknown type', () => {
    expect(() => toActivityDto({ ...ROW, type: 'CARD_TELEPORTED' })).toThrow(/unreadable/);
  });
});

describe('ActivityType', () => {
  it('has the same values in contracts and in the Prisma enum', () => {
    expect(Object.values(ContractActivityType).sort()).toEqual(
      Object.values(PrismaActivityType).sort(),
    );
  });
});
