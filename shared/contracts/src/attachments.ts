import { hasBoardRole } from './boards.js';
import type { UserRefDto } from './activity.js';
import type { MemberRef } from './members.js';

export const ATTACHMENT_LIMITS = {
  MAX_BYTES: 10 * 1024 * 1024,
  MAX_PER_CARD: 20,
  FILE_NAME_MAX: 255,
} as const;

export const INLINE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;

/** What the server accepts, decided by the file's content (magic bytes), never by the client's claim. */
export const ATTACHMENT_MIME_TYPES = [
  ...INLINE_IMAGE_TYPES,
  'application/pdf',
  'application/zip',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
] as const;
export type AttachmentMimeType = (typeof ATTACHMENT_MIME_TYPES)[number];

/** For `<input accept>`; the server decides by content. */
export const ATTACHMENT_ACCEPT =
  '.png,.jpg,.jpeg,.gif,.webp,.pdf,.zip,.txt,.csv,.md,.docx,.xlsx,.pptx,.odt,.ods,.odp';

/** Only png, jpeg, gif and webp are shown inline; SVG never. */
export function isInlineImage(mimeType: string): boolean {
  return (INLINE_IMAGE_TYPES as readonly string[]).includes(mimeType);
}

/** The storage key is never part of a DTO. */
export interface AttachmentDto {
  id: string;
  cardId: string;
  fileName: string;
  mimeType: AttachmentMimeType;
  size: number;
  uploader: UserRefDto;
  createdAt: string;
}

/** Response of the upload and payload of `attachment:created`. */
export interface AttachmentCreatedDto {
  attachment: AttachmentDto;
  attachmentCount: number;
}

/** The uploader, or an ADMIN or the OWNER of the board. */
export function canDeleteAttachment(viewer: MemberRef, uploaderId: string): boolean {
  return viewer.userId === uploaderId || hasBoardRole(viewer.role, 'ADMIN');
}

/** Key for reading files of one board; a 5 to 10 minute window, bound to the board and the user. */
export interface FileTokenDto {
  token: string;
  expiresAt: string;
}

/** Clients refresh the key this often; it is valid for at least 5 minutes. */
export const FILE_TOKEN_REFRESH_MS = 4 * 60_000;

/**
 * Path of a file under `/api/v1`. Images are shown inline unless `download`;
 * everything else is always downloaded.
 */
export function fileUrlPath(attachmentId: string, token: string, download = false): string {
  const base = `/files/${attachmentId}?token=${encodeURIComponent(token)}`;
  return download ? `${base}&download=true` : base;
}
