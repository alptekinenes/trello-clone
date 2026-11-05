import type { CommentDto } from '@trello/contracts';
import { USER_REF_SELECT } from '../activity/activity.mapper.js';

export const COMMENT_SELECT = {
  id: true,
  cardId: true,
  body: true,
  createdAt: true,
  editedAt: true,
  author: { select: USER_REF_SELECT },
} as const;

export interface CommentRow {
  id: string;
  cardId: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  author: { id: string; name: string; avatarUrl: string | null };
}

export function toCommentDto(row: CommentRow): CommentDto {
  return {
    kind: 'comment',
    id: row.id,
    cardId: row.cardId,
    author: { id: row.author.id, name: row.author.name, avatarUrl: row.author.avatarUrl },
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
  };
}
