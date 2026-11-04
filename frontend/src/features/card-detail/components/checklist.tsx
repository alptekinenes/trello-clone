import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import {
  CHECKLIST_LIMITS,
  type CardDetailDto,
  type ChecklistDto,
  type ChecklistItemDto,
} from '@trello/contracts';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { ChevronDownIcon, ChevronUpIcon, TrashIcon } from '../../../shared/ui/icons';
import { InlineEdit } from '../../../shared/ui/inline-edit';
import { useChecklist } from '../hooks/use-checklist';
import { checklistItemsDropId, itemDragId } from '../hooks/use-checklist-dnd';
import { AddChecklistItemComposer } from './add-checklist-item-composer';
import { ChecklistItemRow } from './checklist-item-row';
import { ChecklistProgress } from './checklist-progress';

const ICON_BUTTON =
  'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-surface-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-40';

interface ChecklistProps {
  boardId: string;
  card: CardDetailDto;
  checklist: ChecklistDto;
  /** The items in the order to show them, which differs from the card's while one is dragged. */
  items: ChecklistItemDto[];
}

/** A checklist with its progress, items, and the controls to rename, move and delete it. */
export function Checklist({ boardId, card, checklist, items }: ChecklistProps) {
  const actions = useChecklist(boardId, card, checklist);
  const { setNodeRef: setItemsRef } = useDroppable({
    id: checklistItemsDropId(checklist.id),
    data: { type: 'checklist-items' },
  });
  const done = checklist.items.filter((item) => item.isCompleted).length;

  return (
    <section aria-labelledby={`checklist-title-${checklist.id}`} className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <h3
          id={`checklist-title-${checklist.id}`}
          className="min-w-0 flex-1 text-base font-semibold"
        >
          <InlineEdit
            value={checklist.title}
            label="Checklist başlığı"
            editHint="Checklist başlığını düzenle"
            maxLength={CHECKLIST_LIMITS.TITLE_MAX}
            wrap
            onSave={actions.rename}
            className="w-full px-1 py-0.5 text-left hover:bg-surface-hover"
            inputClassName="w-full border border-focus bg-surface px-1 py-0.5 text-base font-semibold text-fg"
          />
        </h3>
        <button
          ref={actions.upRef}
          type="button"
          aria-label={`“${checklist.title}” checklist'ini yukarı taşı`}
          title="Yukarı taşı"
          disabled={!actions.canMoveUp}
          onClick={() => actions.move('up')}
          className={ICON_BUTTON}
        >
          <ChevronUpIcon />
        </button>
        <button
          ref={actions.downRef}
          type="button"
          aria-label={`“${checklist.title}” checklist'ini aşağı taşı`}
          title="Aşağı taşı"
          disabled={!actions.canMoveDown}
          onClick={() => actions.move('down')}
          className={ICON_BUTTON}
        >
          <ChevronDownIcon />
        </button>
        <button
          type="button"
          aria-label={`“${checklist.title}” checklist'ini sil`}
          title="Checklist'i sil"
          onClick={actions.askDelete}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-surface-hover px-2 text-sm text-fg hover:text-danger pointer-coarse:min-h-11 pointer-coarse:px-3"
        >
          <TrashIcon />
          Sil
        </button>
      </div>
      <ChecklistProgress done={done} total={checklist.items.length} />
      <SortableContext items={items.map((item) => itemDragId(item.id))} strategy={verticalListSortingStrategy}>
        <ul
          ref={setItemsRef}
          aria-label={`“${checklist.title}” öğeleri`}
          className="flex min-h-2 flex-col gap-1"
        >
          {items.map((item) => (
            <ChecklistItemRow
              key={item.id}
              item={item}
              onToggle={actions.toggleItem}
              onEdit={actions.editItem}
              onRemove={actions.removeItem}
            />
          ))}
        </ul>
      </SortableContext>
      <AddChecklistItemComposer
        boardId={boardId}
        cardId={card.id}
        checklistId={checklist.id}
        checklistTitle={checklist.title}
      />
      {actions.confirmingDelete && (
        <ConfirmDialog
          title="Checklist silinsin mi?"
          confirmLabel="Checklist'i sil"
          onConfirm={actions.confirmDelete}
          onCancel={actions.cancelDelete}
          pending={actions.isDeleting}
          error={actions.deleteError}
        >
          <p>
            <strong className="text-fg">“{checklist.title}”</strong> checklist’i ve içindeki{' '}
            {checklist.items.length} öğe silinecek.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
