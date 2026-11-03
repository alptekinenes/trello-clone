import type { CardChecklistCounts } from '@trello/contracts';
import type { Prisma } from '../generated/prisma/client.js';

/**
 * The card's checklist counters, counted inside the transaction that changed them.
 * Call it under the card lock, so the numbers are the ones the write left behind.
 */
export async function countChecklistItems(
  tx: Prisma.TransactionClient,
  cardId: string,
): Promise<CardChecklistCounts> {
  const checklistTotal = await tx.checklistItem.count({ where: { checklist: { cardId } } });
  const checklistDone = await tx.checklistItem.count({
    where: { checklist: { cardId }, isCompleted: true },
  });
  return { checklistTotal, checklistDone };
}
