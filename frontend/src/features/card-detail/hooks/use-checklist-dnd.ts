import {
  type Announcements,
  closestCenter,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  getFirstCollision,
  KeyboardSensor,
  MeasuringStrategy,
  type Over,
  pointerWithin,
  rectIntersection,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { CardDetailDto, ChecklistItemDto } from '@trello/contracts';
import { useRef, useState } from 'react';
import { useRealtimeHold } from '../../../shared/hooks/use-realtime-hold';
import { BoardMouseSensor, BoardTouchSensor } from '../../../shared/lib/dnd-sensors';
import {
  type Columns,
  dropColumns,
  findColumn,
  moveToColumn,
  neighboursOf,
  sameNeighbours,
} from '../../../shared/lib/sortable-columns';
import { useMoveChecklistItem } from '../api/use-checklist-mutations';

type DropKind = 'item' | 'checklist-items';

const PREFIX: Record<DropKind, string> = { item: 'item:', 'checklist-items': 'checklist-items:' };

export const itemDragId = (itemId: string) => `${PREFIX.item}${itemId}`;
/** The item area of a checklist; lets items be dropped into an empty checklist. */
export const checklistItemsDropId = (checklistId: string) =>
  `${PREFIX['checklist-items']}${checklistId}`;

function parseId(id: UniqueIdentifier): { kind: DropKind; id: string } | null {
  const value = String(id);
  for (const kind of Object.keys(PREFIX) as DropKind[]) {
    if (value.startsWith(PREFIX[kind])) return { kind, id: value.slice(PREFIX[kind].length) };
  }
  return null;
}

const idOf = (id: UniqueIdentifier) => parseId(id)?.id ?? '';
const kindOf = (id: UniqueIdentifier) => parseId(id)?.kind ?? null;

const SCREEN_READER_INSTRUCTIONS =
  'Tutmak için tutamaç düğmesinde boşluk tuşuna bas. Tutarken ok tuşlarıyla taşı, bırakmak için ' +
  'yine boşluk ya da Enter, vazgeçmek için Escape tuşuna bas.';

/** Item ids of each checklist of the card, in order. */
export function buildItemColumns(card: CardDetailDto): Columns {
  return Object.fromEntries(
    card.checklists.map((checklist) => [checklist.id, checklist.items.map((item) => item.id)]),
  );
}

/**
 * Drag-and-drop for the items of a card's checklists, within one checklist and across
 * them. The pointer drags the whole row; the keyboard uses the grip button.
 * `container` is where dnd-kit puts its live region (inside the dialog, as a modal
 * dialog makes the rest of the page inert and unreadable).
 */
export function useChecklistDnd(boardId: string, card: CardDetailDto, container: Element | null) {
  const [activeId, setActiveId] = useState<string | null>(null);
  /** Item columns while an item is dragged, so other checklists can open a gap for it. */
  const [dragColumns, setDragColumns] = useState<Columns | null>(null);
  /** Columns right after a drop, shown until the optimistic move reaches the card. */
  const [dropped, setDropped] = useState<{ columns: Columns; card: CardDetailDto } | null>(null);
  // Other users' changes wait while an item is dragged, and are let through once the drop's
  // optimistic change is in the cache (or the drag ended without a move).
  const { hold, release } = useRealtimeHold();
  const moveItem = useMoveChecklistItem(boardId, card.id, {
    onMoved: release,
    // A rollback restores the very `card` kept in `dropped`; stop showing the drop then.
    onRollback: () => {
      setDropped(null);
      release();
    },
  });
  // Last place announced, so "tutuldu" is not overwritten by "1. sıraya geldi" at once.
  const lastAnnouncedRef = useRef<UniqueIdentifier | null>(null);
  const lastCollisionRef = useRef<UniqueIdentifier | null>(null);

  const sensors = useSensors(
    useSensor(BoardMouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(BoardTouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const original = buildItemColumns(card);
  const columns = dragColumns ?? (dropped?.card === card ? dropped.columns : original);
  const itemsById = new Map<string, ChecklistItemDto>(
    card.checklists.flatMap((checklist) => checklist.items.map((item) => [item.id, item] as const)),
  );
  const itemsOf = (checklistId: string): ChecklistItemDto[] =>
    (columns[checklistId] ?? []).flatMap((id) => itemsById.get(id) ?? []);
  const checklistTitle = (checklistId: string | null) =>
    card.checklists.find((checklist) => checklist.id === checklistId)?.title ?? '';
  const itemContent = (itemId: string) => itemsById.get(itemId)?.content ?? '';

  const collisionDetection: CollisionDetection = (args) => {
    const targets = args.droppableContainers.filter((c) => kindOf(c.id) !== null);
    const within = pointerWithin({ ...args, droppableContainers: targets });
    const hits = within.length > 0 ? within : rectIntersection({ ...args, droppableContainers: targets });
    let overId = hits.find((hit) => kindOf(hit.id) === 'item')?.id ?? getFirstCollision(hits, 'id');

    if (overId != null) {
      // Over a checklist's empty space: aim at its closest item, if it has any.
      if (kindOf(overId) === 'checklist-items') {
        const ids = columns[idOf(overId)] ?? [];
        const inList = targets.filter((c) => kindOf(c.id) === 'item' && ids.includes(idOf(c.id)));
        if (inList.length > 0) {
          overId = closestCenter({ ...args, droppableContainers: inList })[0]?.id ?? overId;
        }
      }
      lastCollisionRef.current = overId;
      return [{ id: overId }];
    }
    return lastCollisionRef.current === null ? [] : [{ id: lastCollisionRef.current }];
  };

  /** Checklist and index the dragged item would get from `over`. */
  function target(itemId: string, over: Over | null): { checklistId: string; index: number } | null {
    if (!over) return null;
    const parsed = parseId(over.id);
    if (parsed?.kind === 'checklist-items') {
      const ids = (columns[parsed.id] ?? []).filter((id) => id !== itemId);
      return { checklistId: parsed.id, index: ids.length };
    }
    if (parsed?.kind === 'item') {
      const checklistId = findColumn(columns, parsed.id);
      return checklistId === null
        ? null
        : { checklistId, index: columns[checklistId].indexOf(parsed.id) };
    }
    return null;
  }

  const overItemId = (over: Over | null) => (over && kindOf(over.id) === 'item' ? idOf(over.id) : null);

  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      lastAnnouncedRef.current = active.id;
      const id = idOf(active.id);
      const place = neighboursOf(columns, id);
      return `“${itemContent(id)}” öğesi tutuldu. “${checklistTitle(place?.containerId ?? null)}” checklist'inde ${(place?.index ?? 0) + 1}. sırada.`;
    },
    onDragOver: ({ active, over }) => {
      if (!over || over.id === lastAnnouncedRef.current) return undefined;
      lastAnnouncedRef.current = over.id;
      const id = idOf(active.id);
      const own = neighboursOf(columns, id);
      const place =
        over.id === active.id && own
          ? { checklistId: own.containerId, index: own.index }
          : target(id, over);
      if (!place) return undefined;
      return `“${itemContent(id)}” öğesi “${checklistTitle(place.checklistId)}” checklist'inde ${place.index + 1}. sıraya geldi.`;
    },
    onDragEnd: ({ active, over }) => {
      const id = idOf(active.id);
      const place = over ? neighboursOf(dropColumns(columns, id, overItemId(over)), id) : null;
      return place
        ? `“${itemContent(id)}” öğesi “${checklistTitle(place.containerId)}” checklist'inde ${place.index + 1}. sıraya bırakıldı.`
        : `“${itemContent(id)}” öğesi yerinde kaldı.`;
    },
    onDragCancel: ({ active }) =>
      `Taşıma iptal edildi. “${itemContent(idOf(active.id))}” öğesi yerinde kaldı.`,
  };

  function onDragStart({ active }: DragStartEvent) {
    lastCollisionRef.current = null;
    setActiveId(idOf(active.id));
    setDropped(null);
    setDragColumns(columns);
    hold();
  }

  /** An item that crosses into another checklist joins its column, opening a gap there. */
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over || !dragColumns) return;
    const itemId = idOf(active.id);
    const place = target(itemId, over);
    if (!place || place.checklistId === findColumn(columns, itemId)) return;

    const rect = active.rect.current.translated;
    const below =
      kindOf(over.id) === 'item' &&
      rect !== null &&
      rect.top + rect.height / 2 > over.rect.top + over.rect.height / 2;
    setDragColumns(moveToColumn(columns, itemId, place.checklistId, below ? place.index + 1 : place.index));
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    const itemId = idOf(active.id);
    const before = neighboursOf(original, itemId);
    const final = over ? dropColumns(columns, itemId, overItemId(over)) : null;
    const place = final ? neighboursOf(final, itemId) : null;
    setDragColumns(null);
    if (!final || !place || !before || sameNeighbours(place, before)) {
      release();
      return;
    }

    setDropped({ columns: final, card });
    moveItem.mutate({
      itemId,
      checklistId: place.containerId,
      afterItemId: place.afterId,
      beforeItemId: place.beforeId,
    });
  }

  function onDragCancel() {
    setActiveId(null);
    setDragColumns(null);
    release();
  }

  return {
    contextProps: {
      sensors,
      collisionDetection,
      measuring: { droppable: { strategy: MeasuringStrategy.Always } },
      accessibility: {
        announcements,
        screenReaderInstructions: { draggable: SCREEN_READER_INSTRUCTIONS },
        ...(container && { container }),
      },
      onDragStart,
      onDragOver,
      onDragEnd,
      onDragCancel,
    },
    itemsOf,
    activeItem: activeId ? (itemsById.get(activeId) ?? null) : null,
  };
}
