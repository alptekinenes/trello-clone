import { DndContext, DragOverlay } from '@dnd-kit/core';
import { horizontalListSortingStrategy, SortableContext } from '@dnd-kit/sortable';
import type { BoardDetailDto } from '@trello/contracts';
import { useEffect } from 'react';
import { usePrefersReducedMotion } from '../../../shared/hooks/use-prefers-reduced-motion';
import { useBoardDnd } from '../hooks/use-board-dnd';
import { useCardUiStore } from '../store/card-ui-store';
import { AddListComposer } from './add-list-composer';
import { BoardList, ListDragPreview } from './board-list';
import { CardActionsDialog } from './card-actions-dialog';
import { CARD_OPEN_HINT_ID, CardDragPreview } from './card-tile';

/** Horizontally scrolling lists with their cards, drag-and-drop for both, and "Liste ekle" at the end. */
export function BoardCanvas({ detail }: { detail: BoardDetailDto }) {
  const boardId = detail.board.id;
  const { contextProps, listIds, cardsOf, draggingType, activeList, activeCard } = useBoardDnd(
    boardId,
    detail,
  );
  const labels = new Map(detail.labels.map((label) => [label.id, label]));
  const reducedMotion = usePrefersReducedMotion();
  const actionsCardId = useCardUiStore((state) => state.actionsCardId);
  const resetCardUi = useCardUiStore((state) => state.reset);
  const closeVanishedActions = useCardUiStore((state) => state.closeVanishedActions);
  const actionsCardVanished = useCardUiStore((state) => state.actionsCardVanished);
  const actionsCard = detail.cards.find((card) => card.id === actionsCardId) ?? null;
  // Someone else archived or deleted the card the dialog is open on.
  const actionsCardGone = actionsCardId !== null && actionsCard === null;

  useEffect(() => {
    if (actionsCardGone) closeVanishedActions();
  }, [actionsCardGone, closeVanishedActions]);

  // An open dialog or a pending focus belongs to this visit of the board.
  useEffect(() => () => resetCardUi(), [resetCardUi]);

  return (
    <div className="flex flex-1 items-start gap-3 overflow-x-auto p-4">
      <p id={CARD_OPEN_HINT_ID} hidden>
        Kartı açmak için Enter tuşuna bas.
      </p>
      <DndContext {...contextProps}>
        <SortableContext items={listIds} strategy={horizontalListSortingStrategy}>
          <ol aria-label="Listeler" className="flex items-start gap-3">
            {detail.lists.map((list) => (
              <BoardList
                key={list.id}
                boardId={boardId}
                list={list}
                cards={cardsOf(list.id)}
                labels={labels}
                draggingType={draggingType}
              />
            ))}
          </ol>
        </SortableContext>
        <DragOverlay dropAnimation={reducedMotion ? null : undefined}>
          {activeList && <ListDragPreview list={activeList} cards={cardsOf(activeList.id)} />}
          {activeCard && <CardDragPreview card={activeCard} labels={labels} />}
        </DragOverlay>
      </DndContext>
      <p role="status" className="sr-only">
        {actionsCardVanished ? 'Kart başka biri tarafından kaldırıldı.' : ''}
      </p>
      <AddListComposer boardId={boardId} hasLists={detail.lists.length > 0} />
      {actionsCard && (
        <CardActionsDialog boardId={boardId} card={actionsCard} lists={detail.lists} cards={detail.cards} />
      )}
    </div>
  );
}
