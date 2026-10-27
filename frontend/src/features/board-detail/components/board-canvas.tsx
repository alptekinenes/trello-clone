import { DndContext, DragOverlay } from '@dnd-kit/core';
import { horizontalListSortingStrategy, SortableContext } from '@dnd-kit/sortable';
import type { BoardDetailDto } from '@trello/contracts';
import { usePrefersReducedMotion } from '../../../shared/hooks/use-prefers-reduced-motion';
import { useListDnd } from '../hooks/use-list-dnd';
import { AddListComposer } from './add-list-composer';
import { BoardList, ListDragPreview } from './board-list';

/** Horizontally scrolling lists with drag-and-drop ordering, plus "Liste ekle" at the end. */
export function BoardCanvas({ detail }: { detail: BoardDetailDto }) {
  const boardId = detail.board.id;
  const { contextProps, sortableIds, activeList } = useListDnd(boardId, detail.lists);
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div className="flex flex-1 items-start gap-3 overflow-x-auto p-4">
      <DndContext {...contextProps}>
        <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
          <ol aria-label="Listeler" className="flex items-start gap-3">
            {detail.lists.map((list) => (
              <BoardList key={list.id} boardId={boardId} list={list} />
            ))}
          </ol>
        </SortableContext>
        <DragOverlay dropAnimation={reducedMotion ? null : undefined}>
          {activeList && <ListDragPreview list={activeList} />}
        </DragOverlay>
      </DndContext>
      <AddListComposer boardId={boardId} hasLists={detail.lists.length > 0} />
    </div>
  );
}
