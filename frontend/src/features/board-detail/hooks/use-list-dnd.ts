import {
  type Announcements,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { ListDto } from '@trello/contracts';
import { useRef, useState } from 'react';
import { useMoveList } from '../api/use-list-mutations';
import { BoardMouseSensor, BoardTouchSensor } from '../lib/dnd-sensors';
import { getMoveAnchors } from '../lib/get-move-anchors';

const LIST_PREFIX = 'list:';

/** Sortable ids carry a type prefix, so lists and (later) cards never mix. */
export const listDragId = (listId: string) => `${LIST_PREFIX}${listId}`;
const listIdOf = (dragId: UniqueIdentifier) => String(dragId).slice(LIST_PREFIX.length);

const SCREEN_READER_INSTRUCTIONS =
  'Listeyi tutmak için boşluk ya da Enter tuşuna bas. Tutarken sol ve sağ ok tuşlarıyla ' +
  'taşı, bırakmak için yine boşluk ya da Enter, vazgeçmek için Escape tuşuna bas.';

/** Drag-and-drop state and handlers for reordering the board's lists. */
export function useListDnd(boardId: string, lists: ListDto[]) {
  const moveList = useMoveList(boardId);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Last place announced, so "tutuldu" is not overwritten by "1. sıraya geldi" at once.
  const lastOverRef = useRef<UniqueIdentifier | null>(null);

  const sensors = useSensors(
    useSensor(BoardMouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(BoardTouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sortableIds = lists.map((list) => listDragId(list.id));
  const titleOf = (id: UniqueIdentifier) => lists.find((l) => l.id === listIdOf(id))?.title ?? '';
  const placeOf = (id: UniqueIdentifier) => sortableIds.indexOf(String(id)) + 1;

  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      lastOverRef.current = active.id;
      return `“${titleOf(active.id)}” listesi tutuldu. ${placeOf(active.id)}. sırada, toplam ${lists.length} liste.`;
    },
    onDragOver: ({ active, over }) => {
      if (!over || over.id === lastOverRef.current) return undefined;
      lastOverRef.current = over.id;
      return `“${titleOf(active.id)}” listesi ${placeOf(over.id)}. sıraya geldi.`;
    },
    onDragEnd: ({ active, over }) =>
      over
        ? `“${titleOf(active.id)}” listesi ${placeOf(over.id)}. sıraya bırakıldı.`
        : `“${titleOf(active.id)}” listesi yerinde kaldı.`,
    onDragCancel: ({ active }) =>
      `Taşıma iptal edildi. “${titleOf(active.id)}” listesi yerinde kaldı.`,
  };

  function onDragStart({ active }: DragStartEvent) {
    setActiveId(listIdOf(active.id));
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    const anchors = getMoveAnchors(sortableIds, String(active.id), over ? String(over.id) : null);
    if (!anchors) return;
    moveList.mutate({
      listId: listIdOf(active.id),
      afterListId: anchors.afterId && listIdOf(anchors.afterId),
      beforeListId: anchors.beforeId && listIdOf(anchors.beforeId),
    });
  }

  return {
    contextProps: {
      sensors,
      collisionDetection: closestCenter,
      accessibility: {
        announcements,
        screenReaderInstructions: { draggable: SCREEN_READER_INSTRUCTIONS },
      },
      onDragStart,
      onDragEnd,
      onDragCancel: () => setActiveId(null),
    },
    sortableIds,
    activeList: lists.find((list) => list.id === activeId) ?? null,
  };
}
