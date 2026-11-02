import { CHECKLIST_LIMITS, type ChecklistItemDto } from '@trello/contracts';
import { InlineEdit } from '../../../shared/ui/inline-edit';
import { TrashIcon } from '../../../shared/ui/icons';
import { itemCheckboxId } from '../hooks/use-checklist';

interface ChecklistItemRowProps {
  item: ChecklistItemDto;
  onToggle: (item: ChecklistItemDto, isCompleted: boolean) => void;
  onEdit: (item: ChecklistItemDto, content: string) => void;
  onRemove: (item: ChecklistItemDto) => void;
}

/** One item: tick it, click its text to edit, or delete it. */
export function ChecklistItemRow({ item, onToggle, onEdit, onRemove }: ChecklistItemRowProps) {
  return (
    <li className="flex items-start gap-2 rounded-md px-1 py-1 hover:bg-surface-hover">
      <input
        id={itemCheckboxId(item.id)}
        type="checkbox"
        aria-label={item.content}
        checked={item.isCompleted}
        onChange={(event) => onToggle(item, event.target.checked)}
        className="mt-1 size-4 shrink-0 accent-primary"
      />
      <div className={`min-w-0 flex-1 text-sm ${item.isCompleted ? 'text-fg-muted line-through' : ''}`}>
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
      <button
        type="button"
        aria-label={`“${item.content}” öğesini sil`}
        onClick={() => onRemove(item)}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-surface-hover hover:text-danger"
      >
        <TrashIcon />
      </button>
    </li>
  );
}
