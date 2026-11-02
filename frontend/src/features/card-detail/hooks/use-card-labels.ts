import type { BoardDetailDto, CardDetailDto, LabelDto } from '@trello/contracts';
import { useState } from 'react';
import { useToggleCardLabel } from '../api/use-card-mutations';
import { useCardPanel } from './use-card-panel';

/**
 * Labels of the open card. The card keeps ids only, so what shows is the board's labels
 * that the card has, in board order: an id of a deleted label never shows.
 */
export function useCardLabels(board: BoardDetailDto, card: CardDetailDto) {
  const panel = useCardPanel('labels');
  const toggleLabel = useToggleCardLabel(board.board.id, card.id);
  // false: tick labels for the card; true: create, rename and delete the board's labels.
  const [managing, setManaging] = useState(false);
  const assigned = new Set(card.labelIds);
  const cardLabels: LabelDto[] = board.labels.filter((label) => assigned.has(label.id));

  return {
    panel,
    cardLabels,
    isAssigned: (labelId: string) => assigned.has(labelId),
    toggle: (labelId: string, isAssigned: boolean) =>
      toggleLabel.mutate({ labelId, assigned: isAssigned }),
    managing,
    setManaging,
  };
}
