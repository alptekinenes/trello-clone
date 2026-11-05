import type { CardDetailDto } from '@trello/contracts';
import { useUpdateCard } from '../api/use-card-mutations';

/** Whether the open card is marked complete, and the change that marks it. */
export function useCardCompletion(boardId: string, card: CardDetailDto) {
  const updateCard = useUpdateCard(boardId, card.id);

  return {
    isCompleted: card.completedAt !== null,
    setCompleted: (isCompleted: boolean) => updateCard.mutate({ isCompleted }),
  };
}
