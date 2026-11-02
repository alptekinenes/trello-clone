import type { CardDetailDto } from '@trello/contracts';
import { useCardPanel } from '../hooks/use-card-panel';
import { AddChecklistForm } from './add-checklist-form';
import { Checklist } from './checklist';

/** The checklists of the card, and the form that adds one. */
export function ChecklistsSection({ boardId, card }: { boardId: string; card: CardDetailDto }) {
  const { isOpen } = useCardPanel('checklist');
  if (card.checklists.length === 0 && !isOpen) return null;

  return (
    <div className="flex flex-col gap-6">
      {isOpen && <AddChecklistForm boardId={boardId} cardId={card.id} />}
      {card.checklists.map((checklist) => (
        <Checklist key={checklist.id} boardId={boardId} card={card} checklist={checklist} />
      ))}
    </div>
  );
}
