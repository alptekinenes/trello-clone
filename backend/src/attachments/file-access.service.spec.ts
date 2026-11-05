import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ErrorCode } from '@trello/contracts';
import { Readable } from 'node:stream';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { FileAccessService } from './file-access.service.js';

const BOARD = '6f1c3c1e-7a51-4b8a-9d55-0f3a3e1d2c4b';
const USER = '0b7d2a4e-3c61-4f0b-8a8e-5d9c1e2f3a4b';
const ATTACHMENT = '9a1c3c1e-7a51-4b8a-9d55-0f3a3e1d2c4b';
const NOW = new Date('2026-11-05T12:03:20.000Z');
const ROW = { storageKey: 'key', mimeType: 'image/png', fileName: 'a.png', size: 3 };

function setup({ row = ROW as object | null, stored = true } = {}) {
  const findFirst = vi.fn().mockResolvedValue(row);
  const open = vi
    .fn()
    .mockResolvedValue(stored ? { stream: Readable.from(['abc']), size: 3 } : null);
  const config = {
    getOrThrow: () => 'a-secret-that-is-at-least-32-characters-long',
  } as unknown as ConfigService;
  const service = new FileAccessService(
    config,
    { attachment: { findFirst } } as unknown as PrismaService,
    { open } as unknown as StorageService,
  );
  return { service, findFirst, open };
}

describe('FileAccessService', () => {
  it('serves a file to the holder of a valid key after one membership-scoped query', async () => {
    const { service, findFirst, open } = setup();
    const { token } = service.issueToken(BOARD, USER, NOW);

    const file = await service.open(ATTACHMENT, token, false, NOW);

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: ATTACHMENT,
        boardId: BOARD,
        board: { members: { some: { userId: USER } } },
      },
      select: { storageKey: true, mimeType: true, fileName: true, size: true },
    });
    expect(open).toHaveBeenCalledWith('key');
    expect(file.headers['Content-Type']).toBe('image/png');
    expect(file.headers['Cache-Control']).toMatch(/^private, max-age=(29[5-9]|[3-5]\d\d|600)$/);
  });

  it('refuses a bad key with 403 before touching the database', async () => {
    const { service, findFirst } = setup();
    const { token } = service.issueToken(BOARD, USER, NOW);

    const error = await service.open(ATTACHMENT, `${token}x`, false, NOW).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({
      code: ErrorCode.FILE_TOKEN_INVALID,
    });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('refuses an expired key', async () => {
    const { service } = setup();
    const { token } = service.issueToken(BOARD, USER, NOW);

    await expect(
      service.open(ATTACHMENT, token, false, new Date(NOW.getTime() + 11 * 60_000)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('answers 404 for a malformed id, a missing row and a missing file', async () => {
    const valid = setup();
    const { token } = valid.service.issueToken(BOARD, USER, NOW);
    await expect(valid.service.open('not-a-uuid', token, false, NOW)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(valid.findFirst).not.toHaveBeenCalled();

    const noRow = setup({ row: null });
    await expect(noRow.service.open(ATTACHMENT, token, false, NOW)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(noRow.open).not.toHaveBeenCalled();

    const noFile = setup({ stored: false });
    await expect(noFile.service.open(ATTACHMENT, token, false, NOW)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
