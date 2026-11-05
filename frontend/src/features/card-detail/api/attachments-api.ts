import type { AttachmentCreatedDto } from '@trello/contracts';
import { apiRequest } from '../../../shared/lib/http';
import { apiUpload, type UploadOptions } from '../../../shared/lib/upload';

export const attachmentsApi = {
  upload: (cardId: string, file: File, options: UploadOptions) => {
    const form = new FormData();
    form.append('file', file);
    return apiUpload<AttachmentCreatedDto>(`/cards/${encodeURIComponent(cardId)}/attachments`, form, options);
  },

  remove: (attachmentId: string) =>
    apiRequest<void>(`/attachments/${encodeURIComponent(attachmentId)}`, { method: 'DELETE' }),
};
