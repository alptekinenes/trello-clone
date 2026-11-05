import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AttachmentCreatedDto, BoardRole as BoardRoleName } from '@trello/contracts';
import { BoardRole, CurrentBoardId, CurrentBoardRole } from '../access/board-role.decorator.js';
import { type AuthUser, CurrentUser } from '../common/decorators/current-user.decorator.js';
import { UserThrottlerGuard } from '../common/guards/user-throttler.guard.js';
import { uploadRateLimit } from '../config/env.validation.js';
import { CurrentEventOrigin, type EventOrigin } from '../realtime/event-origin.js';
import { AttachmentsService } from './attachments.service.js';
import { type UploadedFileData, UploadInterceptor } from './upload.options.js';

@Controller('cards/:cardId/attachments')
export class CardAttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  /** Limited per user and per IP: the global throttler counts the IP, UserThrottlerGuard the user. */
  @Post()
  @BoardRole('MEMBER')
  @Throttle({ default: { limit: uploadRateLimit, ttl: 60_000 } })
  @UseGuards(UserThrottlerGuard)
  @UseInterceptors(UploadInterceptor)
  upload(
    @CurrentBoardId() boardId: string,
    @Param('cardId') cardId: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedFileData | undefined,
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<AttachmentCreatedDto> {
    return this.attachments.upload(boardId, cardId, user.id, file, origin);
  }
}

@Controller('attachments/:attachmentId')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Delete()
  @BoardRole('MEMBER')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentBoardId() boardId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: AuthUser,
    @CurrentBoardRole() role: BoardRoleName,
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<void> {
    return this.attachments.remove(boardId, attachmentId, { userId: user.id, role }, origin);
  }
}
