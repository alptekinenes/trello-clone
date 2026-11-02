import {
  type Active,
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
import type { BoardDetailDto, CardSummaryDto } from '@trello/contracts';
import { useEffect, useRef, useState } from 'react';
import { BoardMouseSensor, BoardTouchSensor } from '../../../shared/lib/dnd-sensors';
import {
  type Columns,
  dropColumns,
  findColumn,
  moveToColumn,
} from '../../../shared/lib/sortable-columns';
import { useMoveCard } from '../api/use-card-mutations';
import { useMoveList } from '../api/use-list-mutations';
import { buildColumns, placeOf, samePlace } from '../lib/card-columns';
import { getMoveAnchors } from '../lib/get-move-anchors';
import { useCardUiStore } from '../store/card-ui-store';

export type DragType = 'list' | 'card';
type DropKind = DragType | 'list-cards';

/** Sortable ids carry a type prefix, so lists and cards never mix. */
const PREFIX: Record<DropKind, string> = { list: 'list:', card: 'card:', 'list-cards': 'list-cards:' };

export const listDragId = (listId: string) => `${PREFIX.list}${listId}`;
export const cardDragId = (cardId: string) => `${PREFIX.card}${cardId}`;
/** The card area of a list; lets cards be dropped into an empty list. */
export const listCardsDropId = (listId: string) => `${PREFIX['list-cards']}${listId}`;

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
  'Tutmak için boşluk tuşuna bas. Tutarken ok tuşlarıyla taşı, bırakmak için yine boşluk ' +
  'ya da Enter, vazgeçmek için Escape tuşuna bas.';

/** True when the dragged card's center is below the center of what it is over. */
function isBelow(active: Active, over: Over): boolean {
  const rect = active.rect.current.translated;
  return rect !== null && rect.top + rect.height / 2 > over.rect.top + over.rect.height / 2;
}

/** Drag-and-drop for the board: lists sort horizontally, cards within and across lists. */
export function useBoardDnd(boardId: string, detail: BoardDetailDto) {
  const { lists } = detail;
  const moveList = useMoveList(boardId);
  const focusCard = useCardUiStore((state) => state.focusCard);
  const moveCard = useMoveCard(boardId, {
    // A rollback restores the very `cards` array kept in `dropped`; stop showing the drop then.
    // The card remounts in its old list, so it takes the focus back there.
    onRollback: (card) => {
      setDropped(null);
      if (card) focusCard(card);
    },
  });
  const [active, setActive] = useState<{ type: DragType; id: string } | null>(null);
  /** Card columns while a card is dragged, so other lists can open a gap for it. */
  const [dragColumns, setDragColumns] = useState<Columns | null>(null);
  /**
   * Columns right after a card drop, shown until the optimistic move reaches
   * the board (a new `cards` array), so the card never jumps back for a frame.
   */
  const [dropped, setDropped] = useState<{ columns: Columns; cards: CardSummaryDto[] } | null>(
    null,
  );
  // Last place announced, so "tutuldu" is not overwritten by "1. sıraya geldi" at once.
  const lastAnnouncedRef = useRef<UniqueIdentifier | null>(null);
  // Last collision; reused when the layout shifts under the pointer for a moment.
  const lastCollisionRef = useRef<UniqueIdentifier | null>(null);
  const movedToNewListRef = useRef(false);

  const sensors = useSensors(
    useSensor(BoardMouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(BoardTouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const columns =
    dragColumns ??
    (dropped?.cards === detail.cards ? dropped.columns : buildColumns(lists, detail.cards));
  const cardsById = new Map(detail.cards.map((card) => [card.id, card]));
  const listIds = lists.map((list) => listDragId(list.id));

  const cardsOf = (listId: string): CardSummaryDto[] =>
    (columns[listId] ?? []).flatMap((id) => cardsById.get(id) ?? []);
  const listTitle = (listId: string | null) => lists.find((l) => l.id === listId)?.title ?? '';
  const cardTitle = (cardId: string) => cardsById.get(cardId)?.title ?? '';

  // The layout settles one frame after a card moves to another list.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      movedToNewListRef.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [dragColumns]);

  const collisionDetection: CollisionDetection = (args) => {
    const targets = (kinds: DropKind[]) =>
      args.droppableContainers.filter((c) => kinds.includes(kindOf(c.id) as DropKind));

    if (kindOf(args.active.id) === 'list') {
      return closestCenter({ ...args, droppableContainers: targets(['list']) });
    }

    const cardTargets = targets(['card', 'list-cards']);
    const within = pointerWithin({ ...args, droppableContainers: cardTargets });
    const hits =
      within.length > 0 ? within : rectIntersection({ ...args, droppableContainers: cardTargets });
    let overId = hits.find((hit) => kindOf(hit.id) === 'card')?.id ?? getFirstCollision(hits, 'id');

    if (overId != null) {
      // Over a list's empty space: aim at its closest card, if it has any.
      if (kindOf(overId) === 'list-cards') {
        const ids = columns[idOf(overId)] ?? [];
        const inList = cardTargets.filter((c) => ids.includes(idOf(c.id)) && kindOf(c.id) === 'card');
        if (inList.length > 0) {
          overId = closestCenter({ ...args, droppableContainers: inList })[0]?.id ?? overId;
        }
      }
      lastCollisionRef.current = overId;
      return [{ id: overId }];
    }

    if (movedToNewListRef.current) lastCollisionRef.current = args.active.id;
    return lastCollisionRef.current === null ? [] : [{ id: lastCollisionRef.current }];
  };

  /** List and index the dragged card would get from `over` (for announcements and gaps). */
  function cardTarget(cardId: string, over: Over | null): { listId: string; index: number } | null {
    if (!over) return null;
    const target = parseId(over.id);
    if (target?.kind === 'list-cards') {
      const ids = (columns[target.id] ?? []).filter((id) => id !== cardId);
      return { listId: target.id, index: ids.length };
    }
    if (target?.kind === 'card') {
      const listId = findColumn(columns, target.id);
      return listId === null ? null : { listId, index: columns[listId].indexOf(target.id) };
    }
    return null;
  }

  const listPlace = (id: UniqueIdentifier) => listIds.indexOf(String(id)) + 1;

  const announcements: Announcements = {
    onDragStart: ({ active: dragged }) => {
      lastAnnouncedRef.current = dragged.id;
      const id = idOf(dragged.id);
      if (kindOf(dragged.id) === 'list') {
        return `“${listTitle(id)}” listesi tutuldu. ${listPlace(dragged.id)}. sırada, toplam ${lists.length} liste.`;
      }
      const place = placeOf(columns, id);
      return `“${cardTitle(id)}” kartı tutuldu. “${listTitle(place?.listId ?? null)}” listesinde ${(place?.index ?? 0) + 1}. sırada.`;
    },
    onDragOver: ({ active: dragged, over }) => {
      if (!over || over.id === lastAnnouncedRef.current) return undefined;
      lastAnnouncedRef.current = over.id;
      const id = idOf(dragged.id);
      if (kindOf(dragged.id) === 'list') {
        return `“${listTitle(id)}” listesi ${listPlace(over.id)}. sıraya geldi.`;
      }
      const target = over.id === dragged.id ? placeOf(columns, id) : cardTarget(id, over);
      if (!target) return undefined;
      return `“${cardTitle(id)}” kartı “${listTitle(target.listId)}” listesinde ${target.index + 1}. sıraya geldi.`;
    },
    onDragEnd: ({ active: dragged, over }) => {
      const id = idOf(dragged.id);
      if (kindOf(dragged.id) === 'list') {
        return over
          ? `“${listTitle(id)}” listesi ${listPlace(over.id)}. sıraya bırakıldı.`
          : `“${listTitle(id)}” listesi yerinde kaldı.`;
      }
      const place = over ? placeOf(dropColumns(columns, id, overCardId(over)), id) : null;
      return place
        ? `“${cardTitle(id)}” kartı “${listTitle(place.listId)}” listesinde ${place.index + 1}. sıraya bırakıldı.`
        : `“${cardTitle(id)}” kartı yerinde kaldı.`;
    },
    onDragCancel: ({ active: dragged }) => {
      const id = idOf(dragged.id);
      return kindOf(dragged.id) === 'list'
        ? `Taşıma iptal edildi. “${listTitle(id)}” listesi yerinde kaldı.`
        : `Taşıma iptal edildi. “${cardTitle(id)}” kartı yerinde kaldı.`;
    },
  };

  function overCardId(over: Over | null): string | null {
    return over && kindOf(over.id) === 'card' ? idOf(over.id) : null;
  }

  function onDragStart({ active: dragged }: DragStartEvent) {
    const parsed = parseId(dragged.id);
    if (!parsed || parsed.kind === 'list-cards') return;
    lastCollisionRef.current = null;
    setActive({ type: parsed.kind, id: parsed.id });
    setDropped(null);
    if (parsed.kind === 'card') setDragColumns(columns);
  }

  /** A card that crosses into another list joins that list's column, opening a gap there. */
  function onDragOver({ active: dragged, over }: DragOverEvent) {
    if (kindOf(dragged.id) !== 'card' || !over || !dragColumns) return;
    const cardId = idOf(dragged.id);
    const target = cardTarget(cardId, over);
    if (!target || target.listId === findColumn(columns, cardId)) return;

    const index = kindOf(over.id) === 'card' && isBelow(dragged, over) ? target.index + 1 : target.index;
    movedToNewListRef.current = true;
    setDragColumns(moveToColumn(columns, cardId, target.listId, index));
  }

  function onDragEnd({ active: dragged, over }: DragEndEvent) {
    setActive(null);
    const id = idOf(dragged.id);
    if (kindOf(dragged.id) === 'list') {
      dropList(id, over);
    } else {
      dropCard(id, over);
    }
  }

  function dropList(listId: string, over: Over | null) {
    const anchors = getMoveAnchors(listIds, listDragId(listId), over ? String(over.id) : null);
    if (!anchors) return;
    moveList.mutate({
      listId,
      afterListId: anchors.afterId && idOf(anchors.afterId),
      beforeListId: anchors.beforeId && idOf(anchors.beforeId),
    });
  }

  function dropCard(cardId: string, over: Over | null) {
    const original = placeOf(buildColumns(lists, detail.cards), cardId);
    const final = over ? dropColumns(columns, cardId, overCardId(over)) : null;
    const place = final ? placeOf(final, cardId) : null;
    setDragColumns(null);
    if (!final || !place || !original || samePlace(place, original)) return;

    setDropped({ columns: final, cards: detail.cards });
    moveCard.mutate({
      cardId,
      listId: place.listId,
      afterCardId: place.afterCardId,
      beforeCardId: place.beforeCardId,
    });
  }

  function onDragCancel() {
    setActive(null);
    setDragColumns(null);
  }

  return {
    contextProps: {
      sensors,
      collisionDetection,
      measuring: { droppable: { strategy: MeasuringStrategy.Always } },
      accessibility: {
        announcements,
        screenReaderInstructions: { draggable: SCREEN_READER_INSTRUCTIONS },
      },
      onDragStart,
      onDragOver,
      onDragEnd,
      onDragCancel,
    },
    listIds,
    cardsOf,
    /** What is being dragged; droppables of the other type switch off meanwhile. */
    draggingType: active?.type ?? null,
    activeList: active?.type === 'list' ? (lists.find((l) => l.id === active.id) ?? null) : null,
    activeCard: active?.type === 'card' ? (cardsById.get(active.id) ?? null) : null,
  };
}
