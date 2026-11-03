import { Injectable } from '@nestjs/common';
import type {
  BoardDetailDto,
  BoardRole,
  BoardSummaryDto,
  CreateBoardRequest,
  UpdateBoardRequest,
} from '@trello/contracts';
import { boardNotFound } from '../access/access.errors.js';
import { findCardSummaries } from '../cards/card-summaries.js';
import { LABEL_ORDER, LABEL_SELECT, toLabelDto } from '../labels/label.mapper.js';
import { LIST_ORDER, LIST_SELECT, toListDto } from '../lists/list.mapper.js';
import { MEMBER_ORDER, MEMBER_SELECT, toMemberDto } from '../members/member.mapper.js';
import { lockBoard } from '../ordering/locks.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { EventOrigin } from '../realtime/event-origin.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { BOARD_SELECT, DEFAULT_LABEL_COLORS, toBoardInfo, toBoardSummary } from './board.mapper.js';

/**
 * Board CRUD. Changes are broadcast after they were saved.
 * Callers check access first (BoardAccessGuard).
 */
@Injectable()
export class BoardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Boards the user is a member of, most recently updated first. */
  async listForUser(userId: string): Promise<BoardSummaryDto[]> {
    const memberships = await this.prisma.boardMember.findMany({
      where: { userId },
      select: { role: true, board: { select: BOARD_SELECT } },
      orderBy: [{ board: { updatedAt: 'desc' } }, { boardId: 'asc' }],
    });
    return memberships.map(({ board, role }) => toBoardSummary(board, role));
  }

  /**
   * Creates the board, the owner membership and the default labels in one write.
   * The creator's other tabs learn about it through their user room.
   */
  async create(
    userId: string,
    input: CreateBoardRequest,
    origin: EventOrigin,
  ): Promise<BoardSummaryDto> {
    const board = await this.prisma.board.create({
      data: {
        title: input.title,
        background: input.background,
        members: { create: { userId, role: 'OWNER' } },
        labels: { createMany: { data: DEFAULT_LABEL_COLORS.map((color) => ({ color })) } },
      },
      select: BOARD_SELECT,
    });
    const summary = toBoardSummary(board, 'OWNER');
    this.realtime.toUsers([userId], board.id, origin, { type: 'membership:added', data: summary });
    return summary;
  }

  async getDetail(boardId: string, myRole: BoardRole): Promise<BoardDetailDto> {
    const [board, cards] = await Promise.all([
      this.prisma.board.findUniqueOrThrow({
        where: { id: boardId },
        select: {
          ...BOARD_SELECT,
          members: { select: MEMBER_SELECT, orderBy: [...MEMBER_ORDER] },
          labels: { select: LABEL_SELECT, orderBy: [...LABEL_ORDER] },
          lists: { where: { archivedAt: null }, select: LIST_SELECT, orderBy: [...LIST_ORDER] },
        },
      }),
      findCardSummaries(this.prisma, {
        boardId,
        archivedAt: null,
        list: { archivedAt: null },
      }),
    ]);
    return {
      board: toBoardSummary(board, myRole),
      members: board.members.map(toMemberDto),
      labels: board.labels.map(toLabelDto),
      lists: board.lists.map(toListDto),
      cards,
    };
  }

  async update(
    boardId: string,
    myRole: BoardRole,
    input: UpdateBoardRequest,
    origin: EventOrigin,
  ): Promise<BoardSummaryDto> {
    const board = await this.prisma.board.update({
      where: { id: boardId },
      data: { title: input.title, background: input.background },
      select: BOARD_SELECT,
    });
    // The role differs per member, so the event carries the board without it.
    this.realtime.toBoard(boardId, origin, [{ type: 'board:updated', data: toBoardInfo(board) }]);
    return toBoardSummary(board, myRole);
  }

  /**
   * Lists, cards, labels, members and invitations go with it (cascade).
   * The members are read under the board lock, so a member who was just added is not missed.
   * Every member hears about it in their user room (also on the boards page); then the room is emptied.
   */
  async remove(boardId: string, origin: EventOrigin): Promise<void> {
    const memberIds = await this.prisma.$transaction(async (tx) => {
      if (!(await lockBoard(tx, boardId))) throw boardNotFound();
      const members = await tx.boardMember.findMany({ where: { boardId }, select: { userId: true } });
      await tx.board.delete({ where: { id: boardId } });
      return members.map((member) => member.userId);
    });
    this.realtime.toUsers(memberIds, boardId, origin, { type: 'board:deleted', data: { boardId } });
    this.realtime.closeBoardRoom(boardId);
  }
}
