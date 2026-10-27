import { Injectable } from '@nestjs/common';
import type {
  BoardDetailDto,
  BoardRole,
  BoardSummaryDto,
  CreateBoardRequest,
  UpdateBoardRequest,
} from '@trello/contracts';
import { MEMBER_ORDER, MEMBER_SELECT, toMemberDto } from '../members/member.mapper.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  BOARD_SELECT,
  DEFAULT_LABEL_COLORS,
  LABEL_SELECT,
  toBoardSummary,
  toLabelDto,
} from './board.mapper.js';

/** Board CRUD. Callers check access first (BoardAccessGuard). */
@Injectable()
export class BoardsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Boards the user is a member of, most recently updated first. */
  async listForUser(userId: string): Promise<BoardSummaryDto[]> {
    const memberships = await this.prisma.boardMember.findMany({
      where: { userId },
      select: { role: true, board: { select: BOARD_SELECT } },
      orderBy: [{ board: { updatedAt: 'desc' } }, { boardId: 'asc' }],
    });
    return memberships.map(({ board, role }) => toBoardSummary(board, role));
  }

  /** Creates the board, the owner membership and the default labels in one write. */
  async create(userId: string, input: CreateBoardRequest): Promise<BoardSummaryDto> {
    const board = await this.prisma.board.create({
      data: {
        title: input.title,
        background: input.background,
        members: { create: { userId, role: 'OWNER' } },
        labels: { createMany: { data: DEFAULT_LABEL_COLORS.map((color) => ({ color })) } },
      },
      select: BOARD_SELECT,
    });
    return toBoardSummary(board, 'OWNER');
  }

  async getDetail(boardId: string, myRole: BoardRole): Promise<BoardDetailDto> {
    const board = await this.prisma.board.findUniqueOrThrow({
      where: { id: boardId },
      select: {
        ...BOARD_SELECT,
        members: { select: MEMBER_SELECT, orderBy: [...MEMBER_ORDER] },
        // Enum order (GREEN, YELLOW ...) matches the default label order.
        labels: { select: LABEL_SELECT, orderBy: [{ color: 'asc' }, { createdAt: 'asc' }] },
      },
    });
    return {
      board: toBoardSummary(board, myRole),
      members: board.members.map(toMemberDto),
      labels: board.labels.map(toLabelDto),
    };
  }

  async update(
    boardId: string,
    myRole: BoardRole,
    input: UpdateBoardRequest,
  ): Promise<BoardSummaryDto> {
    const board = await this.prisma.board.update({
      where: { id: boardId },
      data: { title: input.title, background: input.background },
      select: BOARD_SELECT,
    });
    return toBoardSummary(board, myRole);
  }

  /** Lists, cards, labels, members and invitations go with it (cascade). */
  async remove(boardId: string): Promise<void> {
    await this.prisma.board.delete({ where: { id: boardId } });
  }
}
