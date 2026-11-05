import { Injectable } from '@nestjs/common';
import {
  ATTACHMENT_LIMITS,
  type AttachmentCreatedDto,
  type BoardRole,
  canDeleteAttachment,
} from '@trello/contracts';
import { randomUUID } from 'node:crypto';
import { attachmentNotFound, cardNotFound } from '../access/access.errors.js';
import { activityEvents, ActivityService } from '../activity/activity.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { EventOrigin } from '../realtime/event-origin.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { StorageService } from '../storage/storage.service.js';
import { ATTACHMENT_SELECT, toAttachmentDto } from './attachment.mapper.js';
import {
  attachmentLimitReached,
  fileRequired,
  notAttachmentUploader,
  unsupportedFileType,
} from './attachments.errors.js';
import { detectFileType } from './detect-file-type.js';
import { cleanFileName } from './file-name.js';
import type { UploadedFileData } from './upload.options.js';

/**
 * Card attachments. The database row and the card's `attachmentCount` change in one transaction;
 * the file is written before it and removed afterwards when the transaction fails. Deletes go
 * the other way: the row first, the file after the commit (a failed file delete is left to the sweep).
 * Every write is broadcast to the board after its transaction committed.
 * Callers check board access first (BoardAccessGuard).
 */
@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly activity: ActivityService,
    private readonly storage: StorageService,
  ) {}

  async upload(
    boardId: string,
    cardId: string,
    uploaderId: string,
    file: UploadedFileData | undefined,
    origin: EventOrigin,
  ): Promise<AttachmentCreatedDto> {
    if (!file || file.buffer.length === 0) throw fileRequired();
    const fileName = cleanFileName(file.originalname);
    const mimeType = await detectFileType(file.buffer, fileName);
    if (!mimeType) throw unsupportedFileType();

    // Cheap early check; the real one runs under the card lock below.
    const card = await this.prisma.card.findFirst({
      where: { id: cardId, boardId },
      select: { attachmentCount: true },
    });
    if (!card) throw cardNotFound();
    if (card.attachmentCount >= ATTACHMENT_LIMITS.MAX_PER_CARD) throw attachmentLimitReached();

    const storageKey = randomUUID();
    await this.storage.put(storageKey, file.buffer, mimeType);
    try {
      const { created, activities } = await this.prisma.$transaction(async (tx) => {
        // Locks the card row; P2025 (answered 404) when the card was deleted meanwhile.
        const counted = await tx.card.update({
          where: { id: cardId, boardId },
          data: { attachmentCount: { increment: 1 } },
          select: { attachmentCount: true, title: true },
        });
        if (counted.attachmentCount > ATTACHMENT_LIMITS.MAX_PER_CARD) {
          throw attachmentLimitReached();
        }
        const row = await tx.attachment.create({
          data: {
            cardId,
            boardId,
            uploaderId,
            fileName,
            mimeType,
            size: file.buffer.length,
            storageKey,
          },
          select: ATTACHMENT_SELECT,
        });
        const recorded = await this.activity.record(
          tx,
          { boardId, cardId, actorId: uploaderId },
          [
            {
              type: 'CARD_ATTACHMENT_ADDED',
              data: { cardTitle: counted.title, attachment: { id: row.id, fileName } },
            },
          ],
        );
        return {
          created: { attachment: toAttachmentDto(row), attachmentCount: counted.attachmentCount },
          activities: recorded,
        };
      });
      this.realtime.toBoard(boardId, origin, [
        { type: 'attachment:created', data: created },
        ...activityEvents(activities),
      ]);
      return created;
    } catch (error) {
      await this.storage.deleteQuietly([storageKey]);
      throw error;
    }
  }

  /**
   * The uploader, or ADMIN+, deletes. The card row is locked first (the order of `upload` and of a
   * card deletion's cascade). When another request removed the row first, the 404 is thrown inside
   * the transaction, so the lowered counter rolls back.
   */
  async remove(
    boardId: string,
    attachmentId: string,
    viewer: { userId: string; role: BoardRole },
    origin: EventOrigin,
  ): Promise<void> {
    const { cardId, attachmentCount, storageKey, activities } = await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.attachment.findFirst({
          where: { id: attachmentId, boardId },
          select: { cardId: true, uploaderId: true, fileName: true, storageKey: true },
        });
        if (!existing) throw attachmentNotFound();
        if (!canDeleteAttachment(viewer, existing.uploaderId)) throw notAttachmentUploader();

        const card = await tx.card.update({
          where: { id: existing.cardId, boardId },
          data: { attachmentCount: { decrement: 1 } },
          select: { attachmentCount: true, title: true },
        });
        // The foreign key clears the card's cover when this attachment was it.
        const { count } = await tx.attachment.deleteMany({ where: { id: attachmentId, boardId } });
        if (count === 0) throw attachmentNotFound();
        const recorded = await this.activity.record(
          tx,
          { boardId, cardId: existing.cardId, actorId: viewer.userId },
          [
            {
              type: 'CARD_ATTACHMENT_REMOVED',
              data: {
                cardTitle: card.title,
                attachment: { id: attachmentId, fileName: existing.fileName },
              },
            },
          ],
        );
        return {
          cardId: existing.cardId,
          attachmentCount: card.attachmentCount,
          storageKey: existing.storageKey,
          activities: recorded,
        };
      },
    );
    this.realtime.toBoard(boardId, origin, [
      { type: 'attachment:deleted', data: { id: attachmentId, cardId, attachmentCount } },
      ...activityEvents(activities),
    ]);
    await this.storage.deleteQuietly([storageKey]);
  }
}
