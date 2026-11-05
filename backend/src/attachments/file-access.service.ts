import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FileTokenDto } from '@trello/contracts';
import { isUUID } from 'class-validator';
import type { Readable } from 'node:stream';
import { attachmentNotFound } from '../access/access.errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { fileTokenInvalid } from './attachments.errors.js';
import { fileHeaders } from './file-headers.js';
import { deriveFileTokenKey, signFileToken, verifyFileToken } from './file-token.js';

export interface OpenedFile {
  stream: Readable;
  headers: Record<string, string>;
}

/** Issues the key for reading a board's files and serves a file to the holder of a valid key. */
@Injectable()
export class FileAccessService {
  private readonly logger = new Logger(FileAccessService.name);
  private readonly key: Buffer;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {
    this.key = deriveFileTokenKey(config.getOrThrow<string>('JWT_ACCESS_SECRET'));
  }

  /** Callers check board membership first (BoardAccessGuard). */
  issueToken(boardId: string, userId: string, now = new Date()): FileTokenDto {
    const { token, expiresAt } = signFileToken(this.key, { boardId, userId }, now);
    return { token, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Checks the key without the database, then the membership and the attachment in one query:
   * a member who left the board loses access at once even with an unexpired key.
   */
  async open(
    attachmentId: string,
    token: string,
    download: boolean,
    now = new Date(),
  ): Promise<OpenedFile> {
    const claims = verifyFileToken(this.key, token, now);
    if (!claims) throw fileTokenInvalid();
    if (!isUUID(attachmentId)) throw attachmentNotFound();

    const attachment = await this.prisma.attachment.findFirst({
      where: {
        id: attachmentId,
        boardId: claims.boardId,
        board: { members: { some: { userId: claims.userId } } },
      },
      select: { storageKey: true, mimeType: true, fileName: true, size: true },
    });
    if (!attachment) throw attachmentNotFound();

    const stored = await this.storage.open(attachment.storageKey);
    if (!stored) {
      this.logger.warn(`The file of attachment ${attachmentId} is missing from storage`);
      throw attachmentNotFound();
    }
    const maxAgeSeconds = Math.floor((claims.expiresAt.getTime() - now.getTime()) / 1000);
    return {
      stream: stored.stream,
      headers: fileHeaders({
        mimeType: attachment.mimeType,
        fileName: attachment.fileName,
        size: stored.size,
        download,
        maxAgeSeconds,
      }),
    };
  }
}
