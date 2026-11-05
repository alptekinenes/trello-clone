import { apiErrorMessage, isNotFound } from '../../../shared/lib/api-error-message';
import { ApiError } from '../../../shared/lib/http';
import { removeAttachment, restoreAttachment } from '../lib/card-detail-cache';
import { attachmentsApi } from './attachments-api';
import { useCardMutation } from './use-card-mutation';

export const ATTACHMENT_GONE_MESSAGE = 'Ek bulunamadı. Silinmiş olabilir.';

/**
 * Deletes an attachment: it leaves the list and the counter drops at once (a cover it was
 * goes too); a failure brings it back. A 404 means it is gone already, so it stays out.
 */
export function useDeleteAttachment(boardId: string, cardId: string) {
  return useCardMutation({
    boardId,
    cardId,
    mutationFn: (attachmentId: string) => attachmentsApi.remove(attachmentId),
    optimistic: (card, attachmentId) =>
      removeAttachment(card, attachmentId, Math.max(0, card.attachmentCount - 1)),
    touches: (attachmentId) => [`attachment:${attachmentId}`, 'cover'],
    revert: (card, previous, attachmentId, error) => {
      const attachment = previous.attachments.find((item) => item.id === attachmentId);
      if (!attachment || isNotFound(error)) return card;
      return restoreAttachment(card, attachment, previous.coverAttachmentId === attachmentId);
    },
    errorMessage: (error) =>
      isNotFound(error)
        ? ATTACHMENT_GONE_MESSAGE
        : error instanceof ApiError && error.status === 403
          ? apiErrorMessage(error)
          : 'Ek silinemedi. Tekrar dene.',
  });
}
