import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '@trello/contracts';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EventOrigin } from '../realtime/event-origin.js';
import type { RealtimeService } from '../realtime/realtime.service.js';
import { LabelsService } from './labels.service.js';

const BOARD = 'board-1';
const ORIGIN: EventOrigin = { actorId: 'user-1', socketId: 'socket-1' };
const CARD = 'card-1';
const LABEL = 'label-1';
const ROW = { id: LABEL, boardId: BOARD, name: 'Acil', color: 'RED' };

function setup({ found = true as boolean, cardFound = true as boolean } = {}) {
  const label = {
    create: vi.fn().mockResolvedValue(ROW),
    update: vi.fn().mockResolvedValue(ROW),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    findFirst: vi.fn().mockResolvedValue(found ? { id: LABEL } : null),
  };
  const card = { findFirst: vi.fn().mockResolvedValue(cardFound ? { id: CARD } : null) };
  const cardLabel = {
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
  const realtime = { toBoard: vi.fn() };
  const service = new LabelsService(
    { label, card, cardLabel } as unknown as PrismaService,
    realtime as unknown as RealtimeService,
  );
  return { service, realtime, label, card, cardLabel };
}

function codeOf(error: unknown): unknown {
  return (error as { getResponse: () => { code: string } }).getResponse().code;
}

describe('LabelsService', () => {
  it('creates a label on the board with an empty name by default', async () => {
    const { service, label } = setup();

    await expect(service.create(BOARD, { color: 'RED' }, ORIGIN)).resolves.toEqual(ROW);

    expect(label.create.mock.calls[0][0].data).toEqual({ boardId: BOARD, name: '', color: 'RED' });
  });

  it('updates only inside the board', async () => {
    const { service, label } = setup();

    await service.update(BOARD, LABEL, { name: 'Yeni' }, ORIGIN);

    expect(label.update.mock.calls[0][0].where).toEqual({ id: LABEL, boardId: BOARD });
  });

  it('turns a missing label on update into 404 Label not found', async () => {
    const { service, label } = setup();
    label.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('gone', { code: 'P2025', clientVersion: 'test' }),
    );

    const error = await service.update(BOARD, LABEL, {}, ORIGIN).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).message).toBe('Label not found');
  });

  it('lets other update errors through', async () => {
    const { service, label } = setup();
    label.update.mockRejectedValue(new Error('boom'));
    await expect(service.update(BOARD, LABEL, {}, ORIGIN)).rejects.toThrow('boom');
  });

  it('deletes inside the board and 404s when nothing matched', async () => {
    const { service, label } = setup();

    await service.remove(BOARD, LABEL, ORIGIN);
    expect(label.deleteMany).toHaveBeenCalledWith({ where: { id: LABEL, boardId: BOARD } });

    label.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.remove(BOARD, LABEL, ORIGIN)).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('assign', () => {
    it('inserts with skipDuplicates so assigning twice is fine', async () => {
      const { service, label, cardLabel } = setup();

      await service.assign(BOARD, CARD, LABEL, ORIGIN);

      expect(label.findFirst.mock.calls[0][0].where).toEqual({ id: LABEL, boardId: BOARD });
      expect(cardLabel.createMany).toHaveBeenCalledWith({
        data: [{ cardId: CARD, labelId: LABEL }],
        skipDuplicates: true,
      });
    });

    it('refuses a label of another board or a missing one with LABEL_NOT_IN_BOARD', async () => {
      const { service, cardLabel } = setup({ found: false });

      const error = await service.assign(BOARD, CARD, LABEL, ORIGIN).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(codeOf(error)).toBe(ErrorCode.LABEL_NOT_IN_BOARD);
      expect(cardLabel.createMany).not.toHaveBeenCalled();
    });

    it('refuses a card of another board with 404 Card not found', async () => {
      const { service, card, cardLabel } = setup({ cardFound: false });

      const error = await service.assign(BOARD, CARD, LABEL, ORIGIN).catch((e: unknown) => e);

      expect(card.findFirst.mock.calls[0][0].where).toEqual({ id: CARD, boardId: BOARD });
      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).message).toBe('Card not found');
      expect(cardLabel.createMany).not.toHaveBeenCalled();
    });
  });

  it('unassign deletes with deleteMany, scoped to the card board', async () => {
    const { service, cardLabel } = setup();

    await expect(service.unassign(BOARD, CARD, LABEL, ORIGIN)).resolves.toBeUndefined();

    expect(cardLabel.deleteMany).toHaveBeenCalledWith({
      where: { cardId: CARD, labelId: LABEL, card: { boardId: BOARD } },
    });
  });

  describe('realtime', () => {
    it('broadcasts label:created with the created label', async () => {
      const { service, realtime } = setup();

      const created = await service.create(BOARD, { color: 'RED' }, ORIGIN);

      expect(realtime.toBoard).toHaveBeenCalledOnce();
      expect(realtime.toBoard).toHaveBeenCalledWith(BOARD, ORIGIN, [
        { type: 'label:created', data: created },
      ]);
    });

    it('broadcasts label:updated, and nothing when the label is gone', async () => {
      const { service, realtime, label } = setup();

      const updated = await service.update(BOARD, LABEL, { name: 'Yeni' }, ORIGIN);
      expect(realtime.toBoard).toHaveBeenCalledWith(BOARD, ORIGIN, [
        { type: 'label:updated', data: updated },
      ]);

      realtime.toBoard.mockClear();
      label.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('gone', { code: 'P2025', clientVersion: 'test' }),
      );
      await expect(service.update(BOARD, LABEL, {}, ORIGIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(realtime.toBoard).not.toHaveBeenCalled();
    });

    it('broadcasts label:deleted, and nothing when no label matched', async () => {
      const { service, realtime, label } = setup();

      await service.remove(BOARD, LABEL, ORIGIN);
      expect(realtime.toBoard).toHaveBeenCalledWith(BOARD, ORIGIN, [
        { type: 'label:deleted', data: { id: LABEL } },
      ]);

      realtime.toBoard.mockClear();
      label.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.remove(BOARD, LABEL, ORIGIN)).rejects.toBeInstanceOf(NotFoundException);
      expect(realtime.toBoard).not.toHaveBeenCalled();
    });

    it('broadcasts card:label-added only for a new assignment', async () => {
      const { service, realtime, cardLabel } = setup();

      await service.assign(BOARD, CARD, LABEL, ORIGIN);
      expect(realtime.toBoard).toHaveBeenCalledOnce();
      expect(realtime.toBoard).toHaveBeenCalledWith(BOARD, ORIGIN, [
        { type: 'card:label-added', data: { cardId: CARD, labelId: LABEL } },
      ]);

      realtime.toBoard.mockClear();
      cardLabel.createMany.mockResolvedValue({ count: 0 });
      await service.assign(BOARD, CARD, LABEL, ORIGIN);
      expect(realtime.toBoard).not.toHaveBeenCalled();
    });

    it('broadcasts nothing for a refused assignment', async () => {
      const { service, realtime } = setup({ found: false });

      await expect(service.assign(BOARD, CARD, LABEL, ORIGIN)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(realtime.toBoard).not.toHaveBeenCalled();
    });

    it('broadcasts card:label-removed only when an assignment was removed', async () => {
      const { service, realtime, cardLabel } = setup();

      await service.unassign(BOARD, CARD, LABEL, ORIGIN);
      expect(realtime.toBoard).not.toHaveBeenCalled();

      cardLabel.deleteMany.mockResolvedValue({ count: 1 });
      await service.unassign(BOARD, CARD, LABEL, ORIGIN);
      expect(realtime.toBoard).toHaveBeenCalledOnce();
      expect(realtime.toBoard).toHaveBeenCalledWith(BOARD, ORIGIN, [
        { type: 'card:label-removed', data: { cardId: CARD, labelId: LABEL } },
      ]);
    });
  });
});
