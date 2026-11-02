import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CardSummaryDto } from '@trello/contracts';
import { useCallback, useEffect, useRef } from 'react';
import { MoreIcon } from '../../../shared/ui/icons';
import { cardDragId } from '../hooks/use-board-dnd';
import { isFocusTarget, useCardUiStore } from '../store/card-ui-store';

const SURFACE = 'rounded-md bg-surface px-3 py-2 text-sm text-fg shadow-card';

/**
 * Static copy of a card shown under the pointer while dragging. dnd-kit
 * measures the overlay's only child, so the tilt sits one level deeper and
 * does not skew the box used for keyboard moves and collisions.
 */
export function CardDragPreview({ card }: { card: CardSummaryDto }) {
  return (
    <div>
      <div className={`${SURFACE} rotate-2 cursor-grabbing shadow-drag`}>
        <p className="break-words">{card.title}</p>
      </div>
    </div>
  );
}

interface CardTileProps {
  card: CardSummaryDto;
  /** A list is being dragged, so cards do not take drops. */
  dropDisabled: boolean;
}

/**
 * A card in a list. The tile is the drag handle for pointer and keyboard
 * (Space or Enter picks it up); the "…" button opens the card's actions.
 */
export function CardTile({ card, dropDisabled }: CardTileProps) {
  const openActions = useCardUiStore((state) => state.openActions);
  const shouldFocus = useCardUiStore((state) => isFocusTarget(state.focusTarget, card));
  const clearFocus = useCardUiStore((state) => state.clearFocus);
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
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`group relative ${isDragging ? 'opacity-40' : ''}`}
    >
      <div
        ref={setActivator}
        {...attributes}
        {...listeners}
        className={`${SURFACE} cursor-grab pr-9 transition-shadow hover:shadow-raised`}
      >
        <p className="break-words">{card.title}</p>
      </div>
      <button
        type="button"
        aria-label={`“${card.title}” kartının işlemleri`}
        title="Kart işlemleri"
        onClick={() => openActions(card.id)}
        className="absolute top-1 right-1 inline-flex size-7 items-center justify-center rounded-md bg-surface text-fg-muted hover:bg-surface-hover hover:text-fg focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100"
      >
        <MoreIcon />
      </button>
    </li>
  );
}
