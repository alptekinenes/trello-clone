import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  type CardSummaryDto,
  LIST_LIMITS,
  type LabelDto,
  type ListDto,
  type MemberDto,
} from '@trello/contracts';
import { GripIcon, MoreIcon } from '../../../shared/ui/icons';
import { InlineEdit } from '../../../shared/ui/inline-edit';
import { Menu, MenuItem } from '../../../shared/ui/menu';
import { useRenameList, useArchiveList } from '../api/use-list-mutations';
import { useAddCardForm } from '../hooks/use-add-card-form';
import { cardDragId, type DragType, listCardsDropId, listDragId } from '../hooks/use-board-dnd';
import { AddCardComposer } from './add-card-composer';
import { CardTile } from './card-tile';

/** Width of a list column; on narrow screens most of the viewport (see --container-list-narrow). */
export const LIST_WIDTH = 'w-list max-sm:w-list-narrow';
const COLUMN = `flex ${LIST_WIDTH} max-h-full shrink-0 flex-col rounded-lg bg-list shadow-card`;
const ICON_BUTTON =
  'inline-flex size-8 shrink-0 items-center justify-center rounded-md pointer-coarse:size-11 text-fg-muted hover:bg-surface-hover hover:text-fg';
/** The keyboard handle shows on hover and focus for a mouse; touch screens always show it. */
const GRIP_BUTTON = `${ICON_BUTTON} focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover/list:opacity-100 pointer-fine:group-focus-within/list:opacity-100`;
const CARD_STACK = 'flex flex-col gap-2 px-2 pb-2';
const COUNT = 'relative shrink-0 px-1 text-xs text-fg-muted';

/** Static copy of a list shown under the pointer while dragging (tilted one level deeper, see CardDragPreview). */
export function ListDragPreview({ list, cards }: { list: ListDto; cards: CardSummaryDto[] }) {
  return (
    <div className="h-full">
      <div className={`${COLUMN} rotate-2 cursor-grabbing shadow-drag`}>
        <div className="flex shrink-0 items-center gap-1 p-2">
          <span className={ICON_BUTTON}>
            <GripIcon />
          </span>
          <span className="min-w-0 flex-1 truncate px-2 py-1 text-sm font-semibold">
            {list.title}
          </span>
          <span className={COUNT}>{cards.length}</span>
        </div>
        <div className={`${CARD_STACK} min-h-0 overflow-hidden`}>
          {cards.map((card) => (
            <p
              key={card.id}
              className="rounded-md bg-card px-3 py-2 text-sm break-words shadow-card"
            >
              {card.title}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

interface BoardListProps {
  boardId: string;
  list: ListDto;
  cards: CardSummaryDto[];
  labels: ReadonlyMap<string, LabelDto>;
  members: ReadonlyMap<string, MemberDto>;
  watched: ReadonlySet<string>;
  draggingType: DragType | null;
}

export function BoardList({ boardId, list, cards, labels, members, watched, draggingType }: BoardListProps) {
  const rename = useRenameList(boardId);
  const archive = useArchiveList(boardId);
  // Owned here so the list menu's "Kart ekle" can open the composer at the end of the column.
  const composer = useAddCardForm(boardId, list.id);
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
    // While a card is dragged, lists only take it through their card area.
    disabled: { draggable: false, droppable: draggingType === 'card' },
    attributes: { roleDescription: 'sıralanabilir liste' },
  });
  const { setNodeRef: setCardAreaRef } = useDroppable({
    id: listCardsDropId(list.id),
    data: { type: 'list-cards' },
    disabled: draggingType === 'list',
  });

  return (
    <li
      ref={setNodeRef}
      data-list-id={list.id}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`group/list ${COLUMN} snap-start ${isDragging ? 'opacity-40' : ''}`}
    >
      {/* The whole header is a pointer handle; the grip button is the keyboard handle. */}
      <div {...listeners} className="flex shrink-0 cursor-grab items-center gap-1 p-2">
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          aria-label={`“${list.title}” listesini taşı`}
          className={GRIP_BUTTON}
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
        <span className={COUNT}>
          <span aria-hidden="true">{cards.length}</span>
          <span className="sr-only">{cards.length} kart</span>
        </span>
        <Menu
          label={`“${list.title}” listesinin işlemleri`}
          align="end"
          triggerClassName={ICON_BUTTON}
          trigger={<MoreIcon />}
        >
          <MenuItem onSelect={composer.open}>Kart ekle</MenuItem>
          <MenuItem onSelect={() => archive.mutate(list)}>Listeyi arşivle</MenuItem>
        </Menu>
      </div>
      {/* Card area: also the drop target for an empty list. Only the cards scroll; the header and "Kart ekle" stay. */}
      <div ref={setCardAreaRef} className="flex min-h-2 flex-col">
        <SortableContext
          items={cards.map((card) => cardDragId(card.id))}
          strategy={verticalListSortingStrategy}
        >
          {cards.length === 0 && (
            <p className="px-4 pb-1 text-xs text-fg-muted">Bu listede henüz kart yok.</p>
          )}
          {cards.length > 0 && (
            <div className="min-h-0 overflow-y-auto overscroll-y-contain">
              {/* pt-1 and px-2 keep the focus ring and hover ring of the cards from being clipped by the scroll area. */}
              <ol aria-label={`“${list.title}” kartları`} className={`${CARD_STACK} pt-1`}>
                {cards.map((card) => (
                  <CardTile
                    key={card.id}
                    boardId={boardId}
                    card={card}
                    labels={labels}
                    members={members}
                    watched={watched}
                    dropDisabled={draggingType === 'list'}
                  />
                ))}
              </ol>
            </div>
          )}
        </SortableContext>
        <div className="shrink-0">
          <AddCardComposer composer={composer} listTitle={list.title} />
        </div>
      </div>
    </li>
  );
}
