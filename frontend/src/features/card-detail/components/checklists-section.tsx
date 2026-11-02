import { DndContext, DragOverlay } from '@dnd-kit/core';
import type { CardDetailDto } from '@trello/contracts';
import { useState } from 'react';
import { usePrefersReducedMotion } from '../../../shared/hooks/use-prefers-reduced-motion';
import { useCardPanel } from '../hooks/use-card-panel';
import { useChecklistDnd } from '../hooks/use-checklist-dnd';
import { AddChecklistForm } from './add-checklist-form';
import { Checklist } from './checklist';
import { ChecklistItemPreview } from './checklist-item-row';

/** The checklists of the card, and the form that adds one. Items drag within and across them. */
export function ChecklistsSection({ boardId, card }: { boardId: string; card: CardDetailDto }) {
  const { isOpen } = useCardPanel('checklist');
  // dnd-kit's live region goes inside the dialog: the rest of the page is inert while it is open.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const { contextProps, itemsOf, activeItem } = useChecklistDnd(boardId, card, container);
  const reducedMotion = usePrefersReducedMotion();
  if (card.checklists.length === 0 && !isOpen) return null;

  return (
    <div ref={setContainer} className="flex flex-col gap-6">
      <DndContext {...contextProps}>
        {isOpen && <AddChecklistForm boardId={boardId} cardId={card.id} />}
        {card.checklists.map((checklist) => (
          <Checklist
            key={checklist.id}
            boardId={boardId}
            card={card}
            checklist={checklist}
            items={itemsOf(checklist.id)}
          />
        ))}
        <DragOverlay dropAnimation={reducedMotion ? null : undefined}>
          {activeItem && <ChecklistItemPreview item={activeItem} />}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
