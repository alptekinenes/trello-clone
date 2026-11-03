import { Injectable } from '@nestjs/common';
import type { CreateLabelRequest, LabelDto, UpdateLabelRequest } from '@trello/contracts';
import { cardNotFound, labelNotFound } from '../access/access.errors.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { EventOrigin } from '../realtime/event-origin.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { LABEL_SELECT, toLabelDto } from './label.mapper.js';
import { labelNotInBoard } from './labels.errors.js';

/**
 * Board labels and their assignment to cards. Every query is scoped to the
 * board, so a label or card of another board is never touched even if the
 * guard were misconfigured. Every change is broadcast to the board after it was
 * saved; an assignment that changes nothing is not.
 * Callers check access first (BoardAccessGuard).
 */
@Injectable()
export class LabelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async create(boardId: string, input: CreateLabelRequest, origin: EventOrigin): Promise<LabelDto> {
    const created = await this.prisma.label.create({
      data: { boardId, name: input.name ?? '', color: input.color },
      select: LABEL_SELECT,
    });
    const label = toLabelDto(created);
    this.realtime.toBoard(boardId, origin, [{ type: 'label:created', data: label }]);
    return label;
  }

  async update(
    boardId: string,
    labelId: string,
    input: UpdateLabelRequest,
    origin: EventOrigin,
  ): Promise<LabelDto> {
    let label: LabelDto;
    try {
      const updated = await this.prisma.label.update({
        where: { id: labelId, boardId },
        data: { name: input.name, color: input.color },
        select: LABEL_SELECT,
      });
      label = toLabelDto(updated);
    } catch (error) {
      if (isRecordNotFound(error)) throw labelNotFound();
      throw error;
    }
    this.realtime.toBoard(boardId, origin, [{ type: 'label:updated', data: label }]);
    return label;
  }

  /** Deletes the label; its card assignments go with it (cascade). */
  async remove(boardId: string, labelId: string, origin: EventOrigin): Promise<void> {
    const { count } = await this.prisma.label.deleteMany({ where: { id: labelId, boardId } });
    if (count === 0) throw labelNotFound();
    this.realtime.toBoard(boardId, origin, [{ type: 'label:deleted', data: { id: labelId } }]);
  }

  /**
   * Puts the label on the card. Assigning twice is fine. If the card or label is
   * deleted at the same moment the foreign key fails and the filter answers 409.
   */
  async assign(
    boardId: string,
    cardId: string,
    labelId: string,
    origin: EventOrigin,
  ): Promise<void> {
    const [card, label] = await Promise.all([
      this.prisma.card.findFirst({ where: { id: cardId, boardId }, select: { id: true } }),
      this.prisma.label.findFirst({ where: { id: labelId, boardId }, select: { id: true } }),
    ]);
    if (!card) throw cardNotFound();
    if (!label) throw labelNotInBoard();
    const { count } = await this.prisma.cardLabel.createMany({
      data: [{ cardId, labelId }],
      skipDuplicates: true,
    });
    if (count === 0) return;
    this.realtime.toBoard(boardId, origin, [
      { type: 'card:label-added', data: { cardId, labelId } },
    ]);
  }

  /** Takes the label off the card. Not being assigned is fine. */
  async unassign(
    boardId: string,
    cardId: string,
    labelId: string,
    origin: EventOrigin,
  ): Promise<void> {
    const { count } = await this.prisma.cardLabel.deleteMany({
      where: { cardId, labelId, card: { boardId } },
    });
    if (count === 0) return;
    this.realtime.toBoard(boardId, origin, [
      { type: 'card:label-removed', data: { cardId, labelId } },
    ]);
  }
}

function isRecordNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}
