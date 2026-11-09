import { type AttachmentDto, canDeleteAttachment, type MemberRef } from '@trello/contracts';
import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useUpdateCard } from '../api/use-card-mutations';
import { useDeleteAttachment } from '../api/use-delete-attachment';
import { useCardDetailStore } from '../store/card-detail-store';
import { ATTACHMENTS_HEADING_ID, ATTACHMENT_BUTTON_ID, CARD_TITLE_BUTTON_ID } from '../lib/focus-ids';

/**
 * Hands the focus on before the deleted row goes: to the next row's first control, else
 * to the section heading while the section stays, else to the "Ek" button (or the title
 * when an archived card has none).
 */
function focusAfterDelete(item: HTMLElement | null, sectionStays: boolean) {
  for (let next = item?.nextElementSibling; next; next = next.nextElementSibling) {
    const control = next.querySelector<HTMLElement>('a[href], button');
    if (control) {
      control.focus();
      return;
    }
  }
  const stays = sectionStays || (item?.parentElement?.children.length ?? 0) > 1;
  const fallback = stays
    ? document.getElementById(ATTACHMENTS_HEADING_ID)
    : (document.getElementById(ATTACHMENT_BUTTON_ID) ?? document.getElementById(CARD_TITLE_BUTTON_ID));
  fallback?.focus();
}

/**
 * What the viewer can do with one attachment: delete it after a confirmation, if they
 * uploaded it or are an ADMIN. The server checks the same rule again.
 */
export function useAttachmentActions(
  boardId: string,
  cardId: string,
  attachment: AttachmentDto,
  viewer: MemberRef | null,
  /** Whether uploads keep the section on screen after the last attachment is gone. */
  hasUploads: boolean,
  /** Whether this attachment is the card's image cover. */
  isCover: boolean,
) {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const itemRef = useRef<HTMLLIElement>(null);
  const deleteAttachment = useDeleteAttachment(boardId, cardId);
  const updateCard = useUpdateCard(boardId, cardId);
  const canDelete = viewer !== null && canDeleteAttachment(viewer, attachment.uploader.id);

  function confirmDelete() {
    flushSync(() => setIsConfirmingDelete(false));
    focusAfterDelete(itemRef.current, hasUploads);
    deleteAttachment.mutate(attachment.id);
  }

  function toggleCover() {
    updateCard.mutate({ coverAttachmentId: isCover ? null : attachment.id });
    useCardDetailStore.getState().announce(isCover ? 'Kapak kaldırıldı.' : 'Kapak olarak ayarlandı.');
  }

  return {
    itemRef,
    toggleCover,
    canDelete,
    isConfirmingDelete,
    askToDelete: () => setIsConfirmingDelete(true),
    cancelDelete: () => setIsConfirmingDelete(false),
    confirmDelete,
  };
}
