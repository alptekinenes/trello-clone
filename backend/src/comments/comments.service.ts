import { Injectable } from '@nestjs/common';
import {
  type BoardRole,
  canDeleteComment,
  canEditComment,
  type CommentBodyRequest,
  type CommentDto,
} from '@trello/contracts';
import { commentNotFound } from '../access/access.errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { EventOrigin } from '../realtime/event-origin.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { COMMENT_SELECT, toCommentDto } from './comment.mapper.js';
import { notCommentAuthor } from './comments.errors.js';

/**
 * Card comments. The card's `commentCount` changes in the same transaction as the
 * comment, and the new value travels with the event. Every query is scoped to the board.
 * Every write is broadcast to the board after its transaction committed.
 * Callers check board access first (BoardAccessGuard).
 */
@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Adds a comment. The counter update comes first: it locks the card row, and it fails
   * (P2025, answered 404) when the card was deleted after the access check.
   */
  async create(
    boardId: string,
    cardId: string,
    authorId: string,
    input: CommentBodyRequest,
    origin: EventOrigin,
  ): Promise<CommentDto> {
    const { comment, commentCount } = await this.prisma.$transaction(async (tx) => {
      const card = await tx.card.update({
        where: { id: cardId, boardId },
        data: { commentCount: { increment: 1 } },
        select: { commentCount: true },
      });
      const created = await tx.comment.create({
        data: { cardId, boardId, authorId, body: input.body },
        select: COMMENT_SELECT,
      });
      return { comment: toCommentDto(created), commentCount: card.commentCount };
    });
    this.realtime.toBoard(boardId, origin, [
      { type: 'comment:created', data: { comment, commentCount } },
    ]);
    return comment;
  }

  /** Only the author edits. Sets `editedAt` on every edit. */
  async update(
    boardId: string,
    commentId: string,
    userId: string,
    input: CommentBodyRequest,
    origin: EventOrigin,
  ): Promise<CommentDto> {
    const existing = await this.prisma.comment.findFirst({
      where: { id: commentId, boardId },
      select: { authorId: true },
    });
    if (!existing) throw commentNotFound();
    if (!canEditComment(userId, existing.authorId)) throw notCommentAuthor();

    // P2025 (answered 404) when the comment was deleted since the read.
    const updated = await this.prisma.comment.update({
      where: { id: commentId, boardId },
      data: { body: input.body, editedAt: new Date() },
      select: COMMENT_SELECT,
    });
    const comment = toCommentDto(updated);
    this.realtime.toBoard(boardId, origin, [{ type: 'comment:updated', data: comment }]);
    return comment;
  }

  /**
   * The author, or ADMIN+, deletes. The counter update comes first, so the card row is
   * locked before the comment row: the order of `create` and of a card deletion's cascade,
   * which keeps a delete racing a card deletion from deadlocking. When another request
   * removed the row first, the 404 is thrown inside the transaction, so the lowered counter
   * rolls back and two deletes of one comment lower it once.
   */
  async remove(
    boardId: string,
    commentId: string,
    viewer: { userId: string; role: BoardRole },
    origin: EventOrigin,
  ): Promise<void> {
    const { cardId, commentCount } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.comment.findFirst({
        where: { id: commentId, boardId },
        select: { authorId: true, cardId: true },
      });
      if (!existing) throw commentNotFound();
      if (!canDeleteComment(viewer, existing.authorId)) throw notCommentAuthor();

      // P2025 (answered 404) when the card was deleted since the read.
      const card = await tx.card.update({
        where: { id: existing.cardId, boardId },
        data: { commentCount: { decrement: 1 } },
        select: { commentCount: true },
      });
      const { count } = await tx.comment.deleteMany({ where: { id: commentId, boardId } });
      if (count === 0) throw commentNotFound();
      return { cardId: existing.cardId, commentCount: card.commentCount };
    });
    this.realtime.toBoard(boardId, origin, [
      { type: 'comment:deleted', data: { id: commentId, cardId, commentCount } },
    ]);
  }
}
