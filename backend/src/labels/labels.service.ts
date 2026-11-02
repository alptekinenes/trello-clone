import { Injectable } from '@nestjs/common';
import type { CreateLabelRequest, LabelDto, UpdateLabelRequest } from '@trello/contracts';
import { labelNotFound } from '../access/access.errors.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LABEL_SELECT, toLabelDto } from './label.mapper.js';
import { labelNotInBoard } from './labels.errors.js';

/**
 * Board labels and their assignment to cards. Every query is scoped to the
 * board, so a label or card of another board is never touched even if the
 * guard were misconfigured. Callers check access first (BoardAccessGuard).
 */
@Injectable()
export class LabelsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(boardId: string, input: CreateLabelRequest): Promise<LabelDto> {
    const label = await this.prisma.label.create({
      data: { boardId, name: input.name ?? '', color: input.color },
      select: LABEL_SELECT,
    });
    return toLabelDto(label);
  }

  async update(boardId: string, labelId: string, input: UpdateLabelRequest): Promise<LabelDto> {
    try {
      const label = await this.prisma.label.update({
        where: { id: labelId, boardId },
        data: { name: input.name, color: input.color },
        select: LABEL_SELECT,
      });
      return toLabelDto(label);
    } catch (error) {
      if (isRecordNotFound(error)) throw labelNotFound();
      throw error;
    }
  }

  /** Deletes the label; its card assignments go with it (cascade). */
  async remove(boardId: string, labelId: string): Promise<void> {
    const { count } = await this.prisma.label.deleteMany({ where: { id: labelId, boardId } });
    if (count === 0) throw labelNotFound();
  }

  /**
   * Puts the label on the card. Assigning twice is fine. If the card or label is
   * deleted at the same moment the foreign key fails and the filter answers 409.
   */
  async assign(boardId: string, cardId: string, labelId: string): Promise<void> {
    const label = await this.prisma.label.findFirst({
      where: { id: labelId, boardId },
      select: { id: true },
    });
    if (!label) throw labelNotInBoard();
    await this.prisma.cardLabel.createMany({
      data: [{ cardId, labelId }],
      skipDuplicates: true,
    });
  }

  /** Takes the label off the card. Not being assigned is fine. */
  async unassign(boardId: string, cardId: string, labelId: string): Promise<void> {
    await this.prisma.cardLabel.deleteMany({
      where: { cardId, labelId, card: { boardId } },
    });
  }
}

function isRecordNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}
