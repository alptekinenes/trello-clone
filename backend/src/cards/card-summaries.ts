import type { CardSummaryDto } from '@trello/contracts';
import type { Prisma } from '../generated/prisma/client.js';
import { CARD_ORDER, CARD_SELECT, toCardSummary } from './card.mapper.js';

type CardOrder = Prisma.CardOrderByWithRelationInput[];

/**
 * Card summaries without loading any description. Which cards have one comes
 * from a second query that selects ids only; `IS NOT NULL` does not read the
 * (possibly TOASTed) text. Empty descriptions are stored as null, so
 * `description IS NOT NULL` means "has a description".
 */
export async function findCardSummaries(
  db: Pick<Prisma.TransactionClient, 'card'>,
  where: Prisma.CardWhereInput,
  orderBy: CardOrder = [...CARD_ORDER],
): Promise<CardSummaryDto[]> {
  const [cards, described] = await Promise.all([
    db.card.findMany({ where, select: CARD_SELECT, orderBy }),
    db.card.findMany({
      where: { AND: [where, { description: { not: null } }] },
      select: { id: true },
    }),
  ]);
  const withDescription = new Set(described.map((card) => card.id));
  return cards.map((card) => toCardSummary(card, withDescription.has(card.id)));
}
