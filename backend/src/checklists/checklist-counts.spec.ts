import type { Prisma } from '../generated/prisma/client.js';
import { countChecklistItems } from './checklist-counts.js';

describe('countChecklistItems', () => {
  it('counts every item of the card and the completed ones, in the given transaction', async () => {
    const count = vi
      .fn()
      .mockImplementation((args: { where: { isCompleted?: boolean } }) =>
        Promise.resolve(args.where.isCompleted ? 2 : 7),
      );
    const tx = { checklistItem: { count } } as unknown as Prisma.TransactionClient;

    await expect(countChecklistItems(tx, 'card-1')).resolves.toEqual({
      checklistTotal: 7,
      checklistDone: 2,
    });

    expect(count).toHaveBeenCalledWith({ where: { checklist: { cardId: 'card-1' } } });
    expect(count).toHaveBeenCalledWith({
      where: { checklist: { cardId: 'card-1' }, isCompleted: true },
    });
  });
});
