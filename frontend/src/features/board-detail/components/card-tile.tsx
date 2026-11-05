import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CardSummaryDto, LabelDto, MemberDto } from '@trello/contracts';
import { type KeyboardEvent, useCallback, useEffect, useId, useRef } from 'react';
import { useNavigate } from 'react-router';
import { MoreIcon } from '../../../shared/ui/icons';
import { cardDragId } from '../hooks/use-board-dnd';
import { isFocusTarget, useCardUiStore } from '../store/card-ui-store';
import { CardTileBody } from './card-tile-body';

/** Id of the hidden hint every card tile points to with aria-describedby. */
export const CARD_OPEN_HINT_ID = 'card-open-hint';

const SURFACE = 'rounded-md bg-card px-3 py-2 text-sm text-fg shadow-card';

/**
 * Static copy of a card shown under the pointer while dragging. dnd-kit
 * measures the overlay's only child, so the tilt sits one level deeper and
 * does not skew the box used for keyboard moves and collisions.
 */
export function CardDragPreview({
  card,
  labels,
  members,
  watched,
}: {
  card: CardSummaryDto;
  labels: ReadonlyMap<string, LabelDto>;
  members: ReadonlyMap<string, MemberDto>;
  watched: ReadonlySet<string>;
}) {
  return (
    <div>
      <div className={`${SURFACE} rotate-2 cursor-grabbing shadow-drag`}>
        <CardTileBody card={card} labels={labels} members={members} watched={watched} />
      </div>
    </div>
  );
}

interface CardTileProps {
  boardId: string;
  card: CardSummaryDto;
  labels: ReadonlyMap<string, LabelDto>;
  members: ReadonlyMap<string, MemberDto>;
  watched: ReadonlySet<string>;
  /** A list is being dragged, so cards do not take drops. */
  dropDisabled: boolean;
}

/**
 * A card in a list. The tile is the drag handle for pointer and keyboard
 * (Space picks it up, Enter opens it); the "…" button opens the card's actions.
 */
export function CardTile({ boardId, card, labels, members, watched, dropDisabled }: CardTileProps) {
  const openActions = useCardUiStore((state) => state.openActions);
  const shouldFocus = useCardUiStore((state) => isFocusTarget(state.focusTarget, card));
  const clearFocus = useCardUiStore((state) => state.clearFocus);
  const navigate = useNavigate();
  const titleId = useId();
  const labelsId = useId();
  const badgesId = useId();
  const activatorRef = useRef<HTMLDivElement | null>(null);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: cardDragId(card.id),
    data: { type: 'card' },
    disabled: { draggable: false, droppable: dropDisabled },
    attributes: { roleDescription: 'sıralanabilir kart' },
  });

  // Ids of parts that are not rendered are ignored by assistive technology.
  const describedBy = [labelsId, badgesId, CARD_OPEN_HINT_ID, attributes['aria-describedby']].filter(Boolean).join(' ');

  function open() {
    navigate(`/boards/${boardId}/c/${card.id}`, { state: { fromBoard: true } });
  }

  /** Enter opens the card; every other key (Space lifts it) goes to dnd-kit. */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' && !isDragging && event.target === event.currentTarget) {
      event.preventDefault();
      if (!event.repeat) open();
      return;
    }
    listeners?.onKeyDown(event);
  }

  const setActivator = useCallback(
    (node: HTMLDivElement | null) => {
      activatorRef.current = node;
      setActivatorNodeRef(node);
    },
    [setActivatorNodeRef],
  );

  // After a move from the actions dialog: focus the card once it renders in its new place.
  useEffect(() => {
    if (!shouldFocus) return;
    activatorRef.current?.focus();
    clearFocus();
  }, [shouldFocus, clearFocus]);

  return (
    <li
      ref={setNodeRef}
      data-card-id={card.id}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`group relative ${isDragging ? 'opacity-40' : ''}`}
    >
      <div
        ref={setActivator}
        {...attributes}
        {...listeners}
        onClick={open}
        onKeyDown={onKeyDown}
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        className={`${SURFACE} cursor-grab pr-9 transition-shadow hover:ring-2 hover:ring-card-hover-ring pointer-coarse:min-h-11 pointer-coarse:pr-12`}
      >
        <CardTileBody
          card={card}
          labels={labels}
          members={members}
          watched={watched}
          titleId={titleId}
          labelsId={labelsId}
          badgesId={badgesId}
        />
      </div>
      <button
        type="button"
        aria-label={`“${card.title}” kartının işlemleri`}
        title="Kart işlemleri"
        onClick={() => openActions(card.id, card.listId)}
        className="absolute top-1 right-1 inline-flex size-7 items-center justify-center rounded-md pointer-coarse:top-0 pointer-coarse:right-0 pointer-coarse:size-11 bg-card text-fg-muted hover:bg-surface-hover hover:text-fg focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100"
      >
        <MoreIcon />
      </button>
    </li>
  );
}
