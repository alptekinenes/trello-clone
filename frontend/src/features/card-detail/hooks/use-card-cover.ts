import type { CardDetailDto, LabelColor } from '@trello/contracts';
import { useUpdateCard } from '../api/use-card-mutations';
import { useCardPanel } from './use-card-panel';

/** The cover color of the open card and the section that changes it. */
export function useCardCover(boardId: string, card: CardDetailDto) {
  const panel = useCardPanel('cover');
  const updateCard = useUpdateCard(boardId, card.id);

  return {
    panel,
    coverColor: card.coverColor,
    select: (coverColor: LabelColor | null) => updateCard.mutate({ coverColor }),
  };
}
