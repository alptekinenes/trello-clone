import type { PrismaService } from '../prisma/prisma.service.js';
import { findCardSummaries } from './card-summaries.js';

function cardRow(id: string) {
  return {
    id,
    listId: 'list-1',
    title: id,
    position: 1024,
    dueDate: null,
    dueComplete: false,
    completedAt: null,
    coverColor: null,
    members: [],
    archivedAt: null,
    commentCount: 0,
    labels: [],
    checklists: [],
  };
}

function setup() {
  const findMany = vi
    .fn()
    .mockResolvedValueOnce([cardRow('a'), cardRow('b')])
    .mockResolvedValueOnce([{ id: 'b' }]);
  return { findMany, db: { card: { findMany } } as unknown as PrismaService };
}

describe('findCardSummaries', () => {
  it('marks only the cards that appear in the id-only query', async () => {
    const { db } = setup();

    const cards = await findCardSummaries(db, { boardId: 'board-1' });

    expect(cards.map((card) => [card.id, card.hasDescription])).toEqual([
      ['a', false],
      ['b', true],
    ]);
  });

  it('never selects the description text', async () => {
    const { db, findMany } = setup();

    await findCardSummaries(db, { boardId: 'board-1' });

    expect(findMany.mock.calls[0][0].select).not.toHaveProperty('description');
    expect(findMany.mock.calls[1][0]).toEqual({
      where: { AND: [{ boardId: 'board-1' }, { description: { not: null } }] },
      select: { id: true },
    });
  });
});
