import { HttpException, Injectable } from '@nestjs/common';
import { type BoardRole, hasBoardRole } from '@trello/contracts';
import { isUUID } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { boardNotFound, insufficientRole } from './access.errors.js';

/**
 * Board authorization. Non-members get 404 (the board's existence is not
 * revealed); members whose role is too low get 403.
 */
@Injectable()
export class BoardAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getRole(boardId: string, userId: string): Promise<BoardRole | null> {
    if (!isUUID(boardId)) return null;
    const membership = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId } },
      select: { role: true },
    });
    return membership?.role ?? null;
  }

  /** Board of a list, or null when the list does not exist. */
  async boardIdOfList(listId: string): Promise<string | null> {
    if (!isUUID(listId)) return null;
    const list = await this.prisma.list.findUnique({
      where: { id: listId },
      select: { boardId: true },
    });
    return list?.boardId ?? null;
  }

  /** Board of a card, or null when the card does not exist. */
  async boardIdOfCard(cardId: string): Promise<string | null> {
    if (!isUUID(cardId)) return null;
    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      select: { boardId: true },
    });
    return card?.boardId ?? null;
  }

  /** Board of a label, or null when the label does not exist. */
  async boardIdOfLabel(labelId: string): Promise<string | null> {
    if (!isUUID(labelId)) return null;
    const label = await this.prisma.label.findUnique({
      where: { id: labelId },
      select: { boardId: true },
    });
    return label?.boardId ?? null;
  }

  /** Board of a comment, or null when the comment does not exist. */
  async boardIdOfComment(commentId: string): Promise<string | null> {
    if (!isUUID(commentId)) return null;
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { boardId: true },
    });
    return comment?.boardId ?? null;
  }

  /** Board of a checklist, or null when the checklist does not exist. */
  async boardIdOfChecklist(checklistId: string): Promise<string | null> {
    if (!isUUID(checklistId)) return null;
    const checklist = await this.prisma.checklist.findUnique({
      where: { id: checklistId },
      select: { card: { select: { boardId: true } } },
    });
    return checklist?.card.boardId ?? null;
  }

  /** Board of a checklist item, or null when the item does not exist. */
  async boardIdOfChecklistItem(itemId: string): Promise<string | null> {
    if (!isUUID(itemId)) return null;
    const item = await this.prisma.checklistItem.findUnique({
      where: { id: itemId },
      select: { checklist: { select: { card: { select: { boardId: true } } } } },
    });
    return item?.checklist.card.boardId ?? null;
  }

  /**
   * Returns the user's role, or throws when it is missing or below `min`.
   * `notFound` is thrown for non-members, so a list route can say "List not found".
   */
  async requireRole(
    boardId: string | null,
    userId: string,
    min: BoardRole,
    notFound: () => HttpException = boardNotFound,
  ): Promise<BoardRole> {
    const role = boardId ? await this.getRole(boardId, userId) : null;
    if (!role) throw notFound();
    if (!hasBoardRole(role, min)) throw insufficientRole();
    return role;
  }
}
