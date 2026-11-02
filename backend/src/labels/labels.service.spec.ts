import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '@trello/contracts';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { LabelsService } from './labels.service.js';

const BOARD = 'board-1';
const CARD = 'card-1';
const LABEL = 'label-1';
const ROW = { id: LABEL, boardId: BOARD, name: 'Acil', color: 'RED' };

function setup({ found = true as boolean } = {}) {
  const label = {
    create: vi.fn().mockResolvedValue(ROW),
    update: vi.fn().mockResolvedValue(ROW),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    findFirst: vi.fn().mockResolvedValue(found ? { id: LABEL } : null),
  };
  const cardLabel = {
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
  const service = new LabelsService({ label, cardLabel } as unknown as PrismaService);
  return { service, label, cardLabel };
}

function codeOf(error: unknown): unknown {
  return (error as { getResponse: () => { code: string } }).getResponse().code;
}

describe('LabelsService', () => {
  it('creates a label on the board with an empty name by default', async () => {
    const { service, label } = setup();

    await expect(service.create(BOARD, { color: 'RED' })).resolves.toEqual(ROW);

    expect(label.create.mock.calls[0][0].data).toEqual({ boardId: BOARD, name: '', color: 'RED' });
  });

  it('updates only inside the board', async () => {
    const { service, label } = setup();

    await service.update(BOARD, LABEL, { name: 'Yeni' });

    expect(label.update.mock.calls[0][0].where).toEqual({ id: LABEL, boardId: BOARD });
  });

  it('turns a missing label on update into 404 Label not found', async () => {
    const { service, label } = setup();
    label.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('gone', { code: 'P2025', clientVersion: 'test' }),
    );

    const error = await service.update(BOARD, LABEL, {}).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).message).toBe('Label not found');
  });

  it('lets other update errors through', async () => {
    const { service, label } = setup();
    label.update.mockRejectedValue(new Error('boom'));
    await expect(service.update(BOARD, LABEL, {})).rejects.toThrow('boom');
  });

  it('deletes inside the board and 404s when nothing matched', async () => {
    const { service, label } = setup();

    await service.remove(BOARD, LABEL);
    expect(label.deleteMany).toHaveBeenCalledWith({ where: { id: LABEL, boardId: BOARD } });

    label.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.remove(BOARD, LABEL)).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('assign', () => {
    it('inserts with skipDuplicates so assigning twice is fine', async () => {
      const { service, label, cardLabel } = setup();

      await service.assign(BOARD, CARD, LABEL);

      expect(label.findFirst.mock.calls[0][0].where).toEqual({ id: LABEL, boardId: BOARD });
      expect(cardLabel.createMany).toHaveBeenCalledWith({
        data: [{ cardId: CARD, labelId: LABEL }],
        skipDuplicates: true,
      });
    });

    it('refuses a label of another board or a missing one with LABEL_NOT_IN_BOARD', async () => {
      const { service, cardLabel } = setup({ found: false });

      const error = await service.assign(BOARD, CARD, LABEL).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(codeOf(error)).toBe(ErrorCode.LABEL_NOT_IN_BOARD);
      expect(cardLabel.createMany).not.toHaveBeenCalled();
    });
  });

  it('unassign deletes with deleteMany, scoped to the card board', async () => {
    const { service, cardLabel } = setup();

    await expect(service.unassign(BOARD, CARD, LABEL)).resolves.toBeUndefined();

    expect(cardLabel.deleteMany).toHaveBeenCalledWith({
      where: { cardId: CARD, labelId: LABEL, card: { boardId: BOARD } },
    });
  });
});
