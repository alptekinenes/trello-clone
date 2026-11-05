import { type CardRow, toCardSummary } from './card.mapper.js';

const BASE: CardRow = {
  id: 'card-1',
  listId: 'list-1',
  title: 'Tasarım',
  position: 1024,
  dueDate: null,
  dueComplete: false,
  completedAt: null,
  coverColor: null,
  archivedAt: null,
  labels: [],
  members: [],
  checklists: [],
};

describe('toCardSummary', () => {
  it('maps an empty card', () => {
    expect(toCardSummary(BASE, false)).toEqual({
      id: 'card-1',
      listId: 'list-1',
      title: 'Tasarım',
      position: 1024,
      dueDate: null,
      dueComplete: false,
      archivedAt: null,
      labelIds: [],
      hasDescription: false,
      checklistTotal: 0,
      checklistDone: 0,
      completedAt: null,
      coverColor: null,
      memberIds: [],
    });
  });

  it('maps completion, cover color and member ids in the given order', () => {
    const summary = toCardSummary(
      {
        ...BASE,
        completedAt: new Date('2026-11-05T10:00:00.000Z'),
        coverColor: 'BLUE',
        members: [{ userId: 'u2' }, { userId: 'u1' }],
      },
      false,
    );

    expect(summary).toMatchObject({
      completedAt: '2026-11-05T10:00:00.000Z',
      coverColor: 'BLUE',
      memberIds: ['u2', 'u1'],
    });
  });

  it('flattens labels, counts checklist items over all checklists and takes hasDescription from the caller', () => {
    const summary = toCardSummary(
      {
        ...BASE,
        dueDate: new Date('2026-11-01T09:00:00.000Z'),
        archivedAt: new Date('2026-10-28T10:00:00.000Z'),
        labels: [{ labelId: 'label-2' }, { labelId: 'label-1' }],
        checklists: [
          { items: [{ isCompleted: true }, { isCompleted: false }] },
          { items: [{ isCompleted: true }] },
        ],
      },
      true,
    );

    expect(summary).toMatchObject({
      dueDate: '2026-11-01T09:00:00.000Z',
      archivedAt: '2026-10-28T10:00:00.000Z',
      labelIds: ['label-2', 'label-1'],
      hasDescription: true,
      checklistTotal: 3,
      checklistDone: 2,
    });
    expect(summary).not.toHaveProperty('description');
  });
});
