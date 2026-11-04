import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CHECKLIST_LIMITS, type ChecklistItemDto } from '@trello/contracts';
import { GripIcon, TrashIcon } from '../../../shared/ui/icons';
import { InlineEdit } from '../../../shared/ui/inline-edit';
import { itemCheckboxId } from '../hooks/use-checklist';
import { itemDragId } from '../hooks/use-checklist-dnd';

const ROW = 'flex items-start gap-1 rounded-md px-1 py-1 bg-surface';

interface ChecklistItemRowProps {
  item: ChecklistItemDto;
  onToggle: (item: ChecklistItemDto, isCompleted: boolean) => void;
  onEdit: (item: ChecklistItemDto, content: string) => void;
  onRemove: (item: ChecklistItemDto) => void;
}

function ItemContent({ item, onToggle, onEdit }: Omit<ChecklistItemRowProps, 'onRemove'>) {
  return (
    <>
      {/* The label gives the small native checkbox a 28px target (44px on touch). */}
      <label className="inline-flex size-7 shrink-0 pointer-coarse:size-11 cursor-pointer items-center justify-center">
        <input
          id={itemCheckboxId(item.id)}
          type="checkbox"
          aria-label={item.content}
          checked={item.isCompleted}
          onChange={(event) => onToggle(item, event.target.checked)}
          className="size-4 accent-primary"
        />
      </label>
      <div
        className={`min-w-0 flex-1 text-sm ${item.isCompleted ? 'text-fg-muted line-through' : ''}`}
      >
        <InlineEdit
          value={item.content}
          label="Öğe metni"
          editHint="Öğeyi düzenle"
          maxLength={CHECKLIST_LIMITS.ITEM_CONTENT_MAX}
          wrap
          onSave={(content) => onEdit(item, content)}
          className="w-full px-1 py-0.5 text-left"
          inputClassName="w-full border border-focus bg-surface px-1 py-0.5 text-sm text-fg"
        />
      </div>
    </>
  );
}

/** Static copy of an item shown under the pointer while dragging. */
export function ChecklistItemPreview({ item }: { item: ChecklistItemDto }) {
  return (
    <div>
      <div className={`${ROW} cursor-grabbing text-sm shadow-drag`}>
        <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center text-fg-muted">
          <GripIcon />
        </span>
        <span className="min-w-0 flex-1 break-words">{item.content}</span>
      </div>
    </div>
  );
}

/**
 * One item: drag it (the whole row for the pointer, the grip button for the keyboard),
 * tick it, click its text to edit, or delete it.
 */
export function ChecklistItemRow({ item, onToggle, onEdit, onRemove }: ChecklistItemRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: itemDragId(item.id),
    data: { type: 'item' },
    attributes: { roleDescription: 'sıralanabilir öğe' },
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...listeners}
      className={`${ROW} cursor-grab hover:bg-surface-hover ${isDragging ? 'opacity-40' : ''}`}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        aria-label={`“${item.content}” öğesini taşı`}
        className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md pointer-coarse:mt-0 pointer-coarse:size-11 text-fg-muted hover:text-fg"
      >
        <GripIcon />
      </button>
      <ItemContent item={item} onToggle={onToggle} onEdit={onEdit} />
      <button
        type="button"
        aria-label={`“${item.content}” öğesini sil`}
        onClick={() => onRemove(item)}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md pointer-coarse:size-11 text-fg-muted hover:bg-surface-hover hover:text-danger"
      >
        <TrashIcon />
      </button>
    </li>
  );
}
