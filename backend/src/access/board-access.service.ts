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
