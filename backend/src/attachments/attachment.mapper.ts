import type { AttachmentDto, AttachmentMimeType } from '@trello/contracts';
import { USER_REF_SELECT } from '../activity/activity.mapper.js';

/** The storage key is left out on purpose: it never leaves the server. */
export const ATTACHMENT_SELECT = {
  id: true,
  cardId: true,
  fileName: true,
  mimeType: true,
  size: true,
  createdAt: true,
  uploader: { select: USER_REF_SELECT },
} as const;

export interface AttachmentRow {
  id: string;
  cardId: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  uploader: { id: string; name: string; avatarUrl: string | null };
}

export function toAttachmentDto(row: AttachmentRow): AttachmentDto {
  return {
    id: row.id,
    cardId: row.cardId,
    fileName: row.fileName,
    // Only the upload path writes this column, and it stores one of ATTACHMENT_MIME_TYPES.
    mimeType: row.mimeType as AttachmentMimeType,
    size: row.size,
    uploader: {
      id: row.uploader.id,
      name: row.uploader.name,
      avatarUrl: row.uploader.avatarUrl,
    },
    createdAt: row.createdAt.toISOString(),
  };
}
