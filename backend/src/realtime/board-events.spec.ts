import { rebalanceEvents } from './board-events.js';

describe('rebalanceEvents', () => {
  it('is empty when nothing was rebalanced', () => {
    expect(rebalanceEvents({ entity: 'list' }, null)).toEqual([]);
  });

  it('makes one position:rebalanced event with the target and the new positions', () => {
    const events = rebalanceEvents({ entity: 'card', listId: 'l1' }, [
      { id: 'a', position: 1024 },
      { id: 'b', position: 2048 },
    ]);

    expect(events).toEqual([
      {
        type: 'position:rebalanced',
        data: {
          entity: 'card',
          listId: 'l1',
          positions: [
            { id: 'a', position: 1024 },
            { id: 'b', position: 2048 },
          ],
        },
      },
    ]);
  });

  it.each([
    [{ entity: 'list' as const }],
    [{ entity: 'checklist' as const, cardId: 'c1' }],
    [{ entity: 'checklist-item' as const, cardId: 'c1', checklistId: 'k1' }],
  ])('carries the target fields of %j', (target) => {
    const [event] = rebalanceEvents(target, [{ id: 'a', position: 1 }]);
    expect(event?.data).toEqual({ ...target, positions: [{ id: 'a', position: 1 }] });
  });

  it('copies id and position only', () => {
    const [event] = rebalanceEvents({ entity: 'list' }, [
      { id: 'a', position: 1, extra: 'x' } as { id: string; position: number },
    ]);
    expect(event?.data).toEqual({ entity: 'list', positions: [{ id: 'a', position: 1 }] });
  });
});
