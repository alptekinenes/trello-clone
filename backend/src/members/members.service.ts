import { Injectable } from '@nestjs/common';
import {
  type AssignableBoardRole,
  type BoardRole,
  canChangeMemberRole,
  checkMemberRemoval,
  type MemberDto,
  type MemberRef,
} from '@trello/contracts';
import { insufficientRole } from '../access/access.errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { EventOrigin } from '../realtime/event-origin.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { MEMBER_ORDER, MEMBER_SELECT, toMemberDto } from './member.mapper.js';
import { cannotChangeOwner, memberNotFound, ownerCannotLeave } from './members.errors.js';

/** The user acting on the board, with their role as resolved by BoardAccessGuard. */
export interface BoardActor {
  userId: string;
  role: BoardRole;
}

/** Throws the error matching the shared removal rules (contracts `checkMemberRemoval`). */
function assertCanRemove(actor: BoardActor, target: MemberRef): void {
  const check = checkMemberRemoval(actor, target);
  if (check === 'OWNER_CANNOT_LEAVE') throw ownerCannotLeave();
  if (check === 'FORBIDDEN') throw insufficientRole();
}

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(boardId: string): Promise<MemberDto[]> {
    const rows = await this.prisma.boardMember.findMany({
      where: { boardId },
      select: MEMBER_SELECT,
      orderBy: [...MEMBER_ORDER],
    });
    return rows.map(toMemberDto);
  }

  /** Only reachable by the owner (`@BoardRole('OWNER')` on the route), so the actor is the owner. */
  async updateRole(
    boardId: string,
    userId: string,
    role: AssignableBoardRole,
    origin: EventOrigin,
  ): Promise<MemberDto> {
    const target = await this.findRole(boardId, userId);
    if (!canChangeMemberRole('OWNER', target)) throw cannotChangeOwner();

    const row = await this.prisma.boardMember.update({
      where: { boardId_userId: { boardId, userId } },
      data: { role },
      select: MEMBER_SELECT,
    });
    const member = toMemberDto(row);
    this.realtime.toBoard(boardId, origin, [{ type: 'member:updated', data: member }]);
    return member;
  }

  /**
   * Removes a member (or lets one leave). Afterwards, in this order: the user's sockets
   * leave the board room, so they do not get the next event; the others hear that the
   * member is gone; and the user's own tabs are told they lost the board.
   */
  async remove(
    boardId: string,
    actor: BoardActor,
    userId: string,
    origin: EventOrigin,
  ): Promise<void> {
    const role = await this.findRole(boardId, userId);
    assertCanRemove(actor, { userId, role });
    await this.prisma.boardMember.delete({ where: { boardId_userId: { boardId, userId } } });
    this.realtime.removeUserFromBoard(boardId, userId);
    this.realtime.toBoard(boardId, origin, [{ type: 'member:removed', data: { userId } }]);
    this.realtime.toUsers([userId], boardId, origin, {
      type: 'membership:removed',
      data: { boardId },
    });
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
