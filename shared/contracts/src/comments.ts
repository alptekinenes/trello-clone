import { hasBoardRole } from './boards.js';
import type { UserRefDto } from './activity.js';
import type { MemberRef } from './members.js';

export const COMMENT_LIMITS = { BODY_MAX: 5_000 } as const;

export interface CommentDto {
  kind: 'comment';
  id: string;
  cardId: string;
  author: UserRefDto;
  /** Plain text; never render it as HTML. */
  body: string;
  createdAt: string;
  /** null means never edited. */
  editedAt: string | null;
}

/** Body of POST and PATCH. */
export interface CommentBodyRequest {
  body: string;
}

/** Only the author edits a comment. */
export function canEditComment(userId: string, authorId: string): boolean {
  return userId === authorId;
}

/** The author, or an ADMIN or the OWNER of the board. */
export function canDeleteComment(viewer: MemberRef, authorId: string): boolean {
  return viewer.userId === authorId || hasBoardRole(viewer.role, 'ADMIN');
}
