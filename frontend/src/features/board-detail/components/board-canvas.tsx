import { DndContext, DragOverlay } from '@dnd-kit/core';
import { horizontalListSortingStrategy, SortableContext } from '@dnd-kit/sortable';
import type { BoardDetailDto } from '@trello/contracts';
import { useEffect } from 'react';
import { usePrefersReducedMotion } from '../../../shared/hooks/use-prefers-reduced-motion';
import { useBoardDnd } from '../hooks/use-board-dnd';
import { useVanishedCardCleanup } from '../hooks/use-vanished-card-cleanup';
import { useCardUiStore } from '../store/card-ui-store';
import { AddListComposer } from './add-list-composer';
import { BoardList, ListDragPreview } from './board-list';
import { CardActionsDialog } from './card-actions-dialog';
import { CARD_OPEN_HINT_ID, CardDragPreview } from './card-tile';

/** Fills the space under the header; lists are as tall as the screen allows (see BoardList) and scroll sideways. */
const CANVAS = 'flex min-h-0 flex-1 scroll-px-4 items-start gap-3 overflow-x-auto p-4';
/** Narrow screens: one list at a time snaps into view. Off while dragging, or it fights dnd-kit's auto-scroll. */
const SNAP = 'max-sm:snap-x max-sm:snap-mandatory';

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
  const actionsCard = detail.cards.find((card) => card.id === actionsCardId) ?? null;
  const vanishedStatus = useVanishedCardCleanup(detail);

  // An open dialog or a pending focus belongs to this visit of the board.
  useEffect(() => () => resetCardUi(), [resetCardUi]);

  return (
    <div className={`${CANVAS} ${draggingType ? '' : SNAP}`} data-dragging={draggingType ?? undefined}>
      <p id={CARD_OPEN_HINT_ID} hidden>
        Kartı açmak için Enter tuşuna bas.
      </p>
      <DndContext {...contextProps}>
        <SortableContext items={listIds} strategy={horizontalListSortingStrategy}>
          <ol aria-label="Listeler" className="flex items-start gap-3 self-stretch">
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
        {vanishedStatus.text && <span key={vanishedStatus.id}>{vanishedStatus.text}</span>}
      </p>
      <AddListComposer boardId={boardId} hasLists={detail.lists.length > 0} />
      {actionsCard && (
        <CardActionsDialog boardId={boardId} card={actionsCard} lists={detail.lists} cards={detail.cards} />
      )}
    </div>
  );
}
