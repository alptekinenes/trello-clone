import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { LIST_LIMITS, type ListDto } from '@trello/contracts';
import { ArchiveIcon, GripIcon } from '../../../shared/ui/icons';
import { InlineEdit } from '../../../shared/ui/inline-edit';
import { useArchiveList, useRenameList } from '../api/use-list-mutations';
import { listDragId } from '../hooks/use-list-dnd';

const COLUMN = 'flex w-72 shrink-0 flex-col rounded-lg bg-surface-sunken shadow-card';
const ICON_BUTTON =
  'inline-flex size-8 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-surface-hover hover:text-fg';

/** Static copy of a list shown under the pointer while dragging. */
export function ListDragPreview({ list }: { list: ListDto }) {
  return (
    <div className={`${COLUMN} rotate-2 cursor-grabbing shadow-drag`}>
      <div className="flex items-center gap-1 p-2">
        <span className={ICON_BUTTON}>
          <GripIcon />
        </span>
        <span className="truncate px-2 py-1 text-sm font-semibold">{list.title}</span>
      </div>
      <div className="min-h-4" />
    </div>
  );
}

export function BoardList({ boardId, list }: { boardId: string; list: ListDto }) {
  const rename = useRenameList(boardId);
  const archive = useArchiveList(boardId);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: listDragId(list.id),
    data: { type: 'list' },
    attributes: { roleDescription: 'sıralanabilir liste' },
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`${COLUMN} ${isDragging ? 'opacity-40' : ''}`}
    >
      {/* The whole header is a pointer handle; the grip button is the keyboard handle. */}
      <div {...listeners} className="flex cursor-grab items-center gap-1 p-2">
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          aria-label={`“${list.title}” listesini taşı`}
          className={ICON_BUTTON}
        >
          <GripIcon />
        </button>
        <h2 className="min-w-0 flex-1">
          <InlineEdit
            value={list.title}
            label="Liste adı"
            editHint="Liste adını düzenle"
            maxLength={LIST_LIMITS.TITLE_MAX}
            onSave={(title) => rename.mutate({ listId: list.id, title })}
            className="w-full px-2 py-1 text-sm font-semibold text-fg hover:bg-surface-hover"
            inputClassName="w-full border border-focus bg-surface px-2 py-1 text-sm font-semibold text-fg"
          />
        </h2>
        <button
          type="button"
          aria-label={`“${list.title}” listesini arşivle`}
          title="Listeyi arşivle"
          onClick={() => archive.mutate(list)}
          className={ICON_BUTTON}
        >
          <ArchiveIcon />
        </button>
      </div>
      {/* Cards arrive in phase 4. */}
      <div className="min-h-4" />
    </li>
  );
}
