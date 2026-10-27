import { Injectable } from '@nestjs/common';
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

  /** Returns the user's role, or throws when it is missing or below `min`. */
  async requireRole(boardId: string, userId: string, min: BoardRole): Promise<BoardRole> {
    const role = await this.getRole(boardId, userId);
    if (!role) throw boardNotFound();
    if (!hasBoardRole(role, min)) throw insufficientRole();
    return role;
  }
}
