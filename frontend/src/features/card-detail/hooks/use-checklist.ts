import type { CardDetailDto, ChecklistDto, ChecklistItemDto } from '@trello/contracts';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  useDeleteChecklist,
  useDeleteChecklistItem,
  useMoveChecklist,
  useRenameChecklist,
  useUpdateChecklistItem,
} from '../api/use-checklist-mutations';
import { useCardDetailStore } from '../store/card-detail-store';
import { panelButtonId } from './use-card-panel';

type Direction = 'up' | 'down';

export const itemCheckboxId = (itemId: string) => `checklist-item-${itemId}`;
export const addItemButtonId = (checklistId: string) => `add-item-${checklistId}`;

/**
 * One checklist of the open card: rename, move up and down, delete, and its items'
 * tick, edit and delete. Moving keeps the focus on the button that was pressed, and
 * deleting an item hands it on to the next item.
 */
export function useChecklist(boardId: string, card: CardDetailDto, checklist: ChecklistDto) {
  const announce = useCardDetailStore((state) => state.announce);
  const renameChecklist = useRenameChecklist(boardId, card.id);
  const moveChecklist = useMoveChecklist(boardId, card.id);
  const deleteChecklist = useDeleteChecklist(boardId, card.id);
  const updateItem = useUpdateChecklistItem(boardId, card.id);
  const deleteItem = useDeleteChecklistItem(boardId, card.id);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const upRef = useRef<HTMLButtonElement>(null);
  const downRef = useRef<HTMLButtonElement>(null);
  // The button to focus once the checklist has rendered in its new place.
  const refocusRef = useRef<Direction | null>(null);

  const checklists = card.checklists;
  const index = checklists.findIndex((item) => item.id === checklist.id);

  // React moves the checklist's DOM node when the order changes, which drops the focus.
  useEffect(() => {
    const wanted = refocusRef.current;
    if (!wanted) return;
    refocusRef.current = null;
    const wantedButton = wanted === 'up' ? upRef.current : downRef.current;
    const otherButton = wanted === 'up' ? downRef.current : upRef.current;
    (wantedButton?.disabled ? otherButton : wantedButton)?.focus();
  }, [index]);

  function move(direction: Direction) {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= checklists.length) return;
    // Up: between the two above. Down: between the two below.
    const [after, before] =
      direction === 'up'
        ? [checklists[index - 2], checklists[index - 1]]
        : [checklists[index + 1], checklists[index + 2]];
    refocusRef.current = direction;
    moveChecklist.mutate({
      checklistId: checklist.id,
      afterChecklistId: after?.id ?? null,
      beforeChecklistId: before?.id ?? null,
    });
    announce(`“${checklist.title}” checklist'i ${target + 1}. sıraya taşındı.`);
  }

  function confirmDelete() {
    // mutateAsync, not mutate with callbacks: the answer removes this checklist, and with it
    // this component, before mutate's own callbacks would run.
    deleteChecklist.mutateAsync(checklist.id).then(
      () => {
        // Closing the confirmation first makes the page usable, so the focus can move on.
        flushSync(() => setConfirmingDelete(false));
        document.getElementById(panelButtonId('checklist'))?.focus();
      },
      () => undefined, // The failure is shown in the confirmation (and the dialog's alert).
    );
  }

  function cancelDelete() {
    setConfirmingDelete(false);
    deleteChecklist.reset();
  }

  function removeItem(item: ChecklistItemDto) {
    const items = checklist.items;
    const at = items.findIndex((other) => other.id === item.id);
    const next = items[at + 1] ?? items[at - 1];
    const target = next ? itemCheckboxId(next.id) : addItemButtonId(checklist.id);
    document.getElementById(target)?.focus();
    deleteItem.mutate(item.id);
  }

  return {
    canMoveUp: index > 0,
    canMoveDown: index < checklists.length - 1,
    upRef,
    downRef,
    move,
    rename: (title: string) => renameChecklist.mutate({ checklistId: checklist.id, title }),
    confirmingDelete,
    askDelete: () => setConfirmingDelete(true),
    confirmDelete,
    cancelDelete,
    isDeleting: deleteChecklist.isPending,
    deleteError: deleteChecklist.error ? 'Checklist silinemedi. Tekrar dene.' : null,
    toggleItem: (item: ChecklistItemDto, isCompleted: boolean) =>
      updateItem.mutate({ itemId: item.id, isCompleted }),
    editItem: (item: ChecklistItemDto, content: string) =>
      updateItem.mutate({ itemId: item.id, content }),
    removeItem,
  };
}
