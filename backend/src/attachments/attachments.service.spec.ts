import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '@trello/contracts';
import { HTML_AS_PNG, PNG_1X1 } from '../../test/utils/files.js';
import type { ActivityService } from '../activity/activity.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EventOrigin } from '../realtime/event-origin.js';
import type { RealtimeService } from '../realtime/realtime.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { AttachmentsService } from './attachments.service.js';

const BOARD = 'board-1';
const CARD = 'card-1';
const UPLOADER = 'user-1';
const OTHER = 'user-2';
const ORIGIN: EventOrigin = { actorId: UPLOADER, socketId: 'socket-1' };

function row() {
  return {
    id: 'att-1',
    cardId: CARD,
    fileName: 'logo.png',
    mimeType: 'image/png',
    size: PNG_1X1.length,
    createdAt: new Date('2026-11-05T10:00:00.000Z'),
    uploader: { id: UPLOADER, name: 'Ayşe', avatarUrl: null },
  };
}

interface Options {
  preCount?: number | null;
  count?: number;
  deleted?: number;
  existing?: { cardId: string; uploaderId: string; fileName: string; storageKey: string } | null;
  createFails?: boolean;
}

function setup({
  preCount = 0,
  count = 1,
  deleted = 1,
  existing = { cardId: CARD, uploaderId: UPLOADER, fileName: 'logo.png', storageKey: 'key-1' },
  createFails = false,
}: Options = {}) {
  const calls: string[] = [];
  const tx = {
    card: {
      update: vi.fn(() => {
        calls.push('card.update');
        return Promise.resolve({ attachmentCount: count, title: 'Kart' });
      }),
    },
    attachment: {
      create: vi.fn((_args: unknown) => {
        calls.push('attachment.create');
        return createFails ? Promise.reject(new Error('db down')) : Promise.resolve(row());
      }),
      findFirst: vi.fn().mockResolvedValue(existing),
      deleteMany: vi.fn(() => {
        calls.push('attachment.deleteMany');
        return Promise.resolve({ count: deleted });
      }),
    },
  };
  let broadcastsAtCommit = -1;
  const realtime = { toBoard: vi.fn() };
  const prisma = {
    card: {
      findFirst: vi
        .fn()
        .mockResolvedValue(preCount === null ? null : { attachmentCount: preCount }),
    },
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => {
      const result = await fn(tx);
      broadcastsAtCommit = realtime.toBoard.mock.calls.length;
      return result;
    }),
  };
  const activityRecord = vi.fn(() => {
    calls.push('activity.record');
    return Promise.resolve([
      {
        kind: 'activity',
        id: 'act-1',
        cardId: CARD,
        actor: { id: UPLOADER, name: 'Ayşe', avatarUrl: null },
        createdAt: '2026-11-05T10:00:00.000Z',
        type: 'CARD_ATTACHMENT_ADDED',
        data: { cardTitle: 'Kart', attachment: { id: 'att-1', fileName: 'logo.png' } },
      },
    ]);
  });
  const storage = {
    put: vi.fn().mockResolvedValue(undefined),
    deleteQuietly: vi.fn().mockResolvedValue(undefined),
  };
  const service = new AttachmentsService(
    prisma as unknown as PrismaService,
    realtime as unknown as RealtimeService,
    { record: activityRecord } as unknown as ActivityService,
    storage as unknown as StorageService,
  );
  return {
    service,
    prisma,
    tx,
    storage,
    realtime,
    calls,
    activityRecord,
    commitMark: () => broadcastsAtCommit,
  };
}

function broadcast(realtime: { toBoard: { mock: { calls: unknown[][] } } }): { type: string }[] {
  return realtime.toBoard.mock.calls[0][2] as { type: string }[];
}

const png = { originalname: 'logo.png', buffer: PNG_1X1 };

describe('AttachmentsService.upload', () => {
  it('stores the file, counts it, records the activity and broadcasts after the commit', async () => {
    const { service, storage, tx, realtime, calls, commitMark, activityRecord } = setup({
      count: 4,
    });

    const result = await service.upload(BOARD, CARD, UPLOADER, png, ORIGIN);

    expect(result.attachmentCount).toBe(4);
    expect(result.attachment).toMatchObject({
      id: 'att-1',
      mimeType: 'image/png',
      fileName: 'logo.png',
    });
    expect(JSON.stringify(result)).not.toContain('storageKey');
    const [key, , contentType] = storage.put.mock.calls[0] as [string, Buffer, string];
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect(contentType).toBe('image/png');
    expect(tx.attachment.create.mock.calls[0][0]).toMatchObject({
      data: { storageKey: key, mimeType: 'image/png', size: PNG_1X1.length },
    });
    expect(calls).toEqual(['card.update', 'attachment.create', 'activity.record']);
    expect(activityRecord).toHaveBeenCalledOnce();
    expect(commitMark()).toBe(0);
    expect(broadcast(realtime).map((event) => event.type)).toEqual([
      'attachment:created',
      'activity:created',
    ]);
  });

  it('detects the type from the content, not from the name', async () => {
    const { service, storage } = setup();
    await service.upload(BOARD, CARD, UPLOADER, { originalname: 'a.pdf', buffer: PNG_1X1 }, ORIGIN);
    expect((storage.put.mock.calls[0] as unknown[])[2]).toBe('image/png');
  });

  it('answers 415 without writing a file for content that is not allowed', async () => {
    const { service, storage, prisma } = setup();
    const error = await service
      .upload(BOARD, CARD, UPLOADER, { originalname: 'a.png', buffer: HTML_AS_PNG }, ORIGIN)
      .catch((e: unknown) => e);
    expect((error as { getStatus(): number }).getStatus()).toBe(415);
    expect((error as { getResponse(): { code: string } }).getResponse().code).toBe(
      ErrorCode.UNSUPPORTED_FILE_TYPE,
    );
    expect(storage.put).not.toHaveBeenCalled();
    expect(prisma.card.findFirst).not.toHaveBeenCalled();
  });

  it('answers 400 for a missing or empty file', async () => {
    const { service, storage } = setup();
    await expect(service.upload(BOARD, CARD, UPLOADER, undefined, ORIGIN)).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      service.upload(
        BOARD,
        CARD,
        UPLOADER,
        { originalname: 'a.txt', buffer: Buffer.alloc(0) },
        ORIGIN,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('answers 404 for a card that is not on the board, without writing a file', async () => {
    const { service, storage } = setup({ preCount: null });
    await expect(service.upload(BOARD, CARD, UPLOADER, png, ORIGIN)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('answers 409 at the early check without writing a file', async () => {
    const { service, storage } = setup({ preCount: 20 });
    const error = await service.upload(BOARD, CARD, UPLOADER, png, ORIGIN).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: ErrorCode.ATTACHMENT_LIMIT_REACHED,
    });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('removes the new file when the 21st upload loses the race under the lock', async () => {
    const { service, storage, realtime, tx } = setup({ preCount: 19, count: 21 });
    await expect(service.upload(BOARD, CARD, UPLOADER, png, ORIGIN)).rejects.toBeInstanceOf(
      ConflictException,
    );
    const key = (storage.put.mock.calls[0] as [string])[0];
    expect(storage.deleteQuietly).toHaveBeenCalledWith([key]);
    expect(tx.attachment.create).not.toHaveBeenCalled();
    expect(realtime.toBoard).not.toHaveBeenCalled();
  });

  it('removes the new file and rethrows when the transaction fails', async () => {
    const { service, storage, realtime } = setup({ createFails: true });
    await expect(service.upload(BOARD, CARD, UPLOADER, png, ORIGIN)).rejects.toThrow('db down');
    const key = (storage.put.mock.calls[0] as [string])[0];
    expect(storage.deleteQuietly).toHaveBeenCalledWith([key]);
    expect(realtime.toBoard).not.toHaveBeenCalled();
  });
});

describe('AttachmentsService.remove', () => {
  const uploader = { userId: UPLOADER, role: 'MEMBER' as const };

  it('lets the uploader delete: lowers the counter first, deletes the file after the commit', async () => {
    const { service, storage, realtime, calls, commitMark } = setup({ count: 2 });

    await service.remove(BOARD, 'att-1', uploader, ORIGIN);

    expect(calls).toEqual(['card.update', 'attachment.deleteMany', 'activity.record']);
    expect(commitMark()).toBe(0);
    expect(broadcast(realtime)[0]).toEqual({
      type: 'attachment:deleted',
      data: { id: 'att-1', cardId: CARD, attachmentCount: 2 },
    });
    expect(storage.deleteQuietly).toHaveBeenCalledWith(['key-1']);
  });

  it('lets an ADMIN delete another member upload', async () => {
    const { service, storage } = setup();
    await service.remove(BOARD, 'att-1', { userId: OTHER, role: 'ADMIN' }, ORIGIN);
    expect(storage.deleteQuietly).toHaveBeenCalledOnce();
  });

  it('answers 403 to another MEMBER and touches nothing', async () => {
    const { service, tx, storage, realtime } = setup();
    await expect(
      service.remove(BOARD, 'att-1', { userId: OTHER, role: 'MEMBER' }, ORIGIN),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.card.update).not.toHaveBeenCalled();
    expect(storage.deleteQuietly).not.toHaveBeenCalled();
    expect(realtime.toBoard).not.toHaveBeenCalled();
  });

  it('answers 404 for a missing attachment', async () => {
    const { service, storage } = setup({ existing: null });
    await expect(service.remove(BOARD, 'att-1', uploader, ORIGIN)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(storage.deleteQuietly).not.toHaveBeenCalled();
  });

  it('answers 404 and keeps the file when another request deleted the row first', async () => {
    const { service, storage, realtime } = setup({ deleted: 0 });
    await expect(service.remove(BOARD, 'att-1', uploader, ORIGIN)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(storage.deleteQuietly).not.toHaveBeenCalled();
    expect(realtime.toBoard).not.toHaveBeenCalled();
  });
});
