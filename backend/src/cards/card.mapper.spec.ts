import { type CardRow, toCardSummary } from './card.mapper.js';

const BASE: CardRow = {
  id: 'card-1',
  listId: 'list-1',
  title: 'Tasarım',
  position: 1024,
  dueDate: null,
  dueComplete: false,
  archivedAt: null,
  description: null,
  labels: [],
  checklists: [],
};

describe('toCardSummary', () => {
  it('maps an empty card', () => {
    expect(toCardSummary(BASE)).toEqual({
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
    });
  });

  it('flattens labels, counts checklist items over all checklists and hides the description', () => {
    const summary = toCardSummary({
      ...BASE,
      dueDate: new Date('2026-11-01T09:00:00.000Z'),
      archivedAt: new Date('2026-10-28T10:00:00.000Z'),
      description: 'Ayrıntılar',
      labels: [{ labelId: 'label-2' }, { labelId: 'label-1' }],
      checklists: [
        { items: [{ isCompleted: true }, { isCompleted: false }] },
        { items: [{ isCompleted: true }] },
      ],
    });

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
