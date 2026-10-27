import { Injectable } from '@nestjs/common';
import {
  type AssignableBoardRole,
  type BoardRole,
  hasBoardRole,
  type MemberDto,
} from '@trello/contracts';
import { insufficientRole } from '../access/access.errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MEMBER_ORDER, MEMBER_SELECT, toMemberDto } from './member.mapper.js';
import { cannotChangeOwner, memberNotFound, ownerCannotLeave } from './members.errors.js';

/** The user acting on the board, with their role as resolved by BoardAccessGuard. */
export interface BoardActor {
  userId: string;
  role: BoardRole;
}

/**
 * Who may remove whom:
 * - anyone except the owner may leave;
 * - ADMIN+ removes members, only the OWNER removes admins;
 * - nobody removes the owner.
 */
function assertCanRemove(actor: BoardActor, target: { userId: string; role: BoardRole }): void {
  if (target.userId === actor.userId) {
    if (target.role === 'OWNER') throw ownerCannotLeave();
    return;
  }
  if (target.role === 'OWNER') throw insufficientRole();
  const required: BoardRole = target.role === 'ADMIN' ? 'OWNER' : 'ADMIN';
  if (!hasBoardRole(actor.role, required)) throw insufficientRole();
}

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(boardId: string): Promise<MemberDto[]> {
    const rows = await this.prisma.boardMember.findMany({
      where: { boardId },
      select: MEMBER_SELECT,
      orderBy: [...MEMBER_ORDER],
    });
    return rows.map(toMemberDto);
  }

  /** Only called by the owner (checked by the guard). */
  async updateRole(
    boardId: string,
    userId: string,
    role: AssignableBoardRole,
  ): Promise<MemberDto> {
    const target = await this.findRole(boardId, userId);
    if (target === 'OWNER') throw cannotChangeOwner();

    const row = await this.prisma.boardMember.update({
      where: { boardId_userId: { boardId, userId } },
      data: { role },
      select: MEMBER_SELECT,
    });
    return toMemberDto(row);
  }

  async remove(boardId: string, actor: BoardActor, userId: string): Promise<void> {
    const role = await this.findRole(boardId, userId);
    assertCanRemove(actor, { userId, role });
    await this.prisma.boardMember.delete({ where: { boardId_userId: { boardId, userId } } });
  }

  private async findRole(boardId: string, userId: string): Promise<BoardRole> {
    const member = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId } },
      select: { role: true },
    });
    if (!member) throw memberNotFound();
    return member.role;
  }
}
