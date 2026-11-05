import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AttachmentCreatedDto,
  BoardRole as BoardRoleName,
  FileTokenDto,
} from '@trello/contracts';
import type { Response } from 'express';
import { BoardRole, CurrentBoardId, CurrentBoardRole } from '../access/board-role.decorator.js';
import { type AuthUser, CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { UserThrottlerGuard } from '../common/guards/user-throttler.guard.js';
import { uploadRateLimit } from '../config/env.validation.js';
import { CurrentEventOrigin, type EventOrigin } from '../realtime/event-origin.js';
import { AttachmentsService } from './attachments.service.js';
import { FileQueryDto } from './dto/file-query.dto.js';
import { FileAccessService } from './file-access.service.js';
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

@Controller('boards/:boardId/file-token')
export class FileTokenController {
  constructor(private readonly files: FileAccessService) {}

  @Get()
  @BoardRole('MEMBER')
  @Header('Cache-Control', 'no-store')
  issue(@Param('boardId') boardId: string, @CurrentUser() user: AuthUser): FileTokenDto {
    return this.files.issueToken(boardId, user.id);
  }
}

/** Public: an `<img>` cannot send a Bearer token. The key in the query plus the membership check authorize. */
@Controller('files/:attachmentId')
export class FilesController {
  constructor(private readonly files: FileAccessService) {}

  @Get()
  @Public()
  async serve(
    @Param('attachmentId') attachmentId: string,
    @Query() query: FileQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const { stream, headers } = await this.files.open(
      attachmentId,
      query.token,
      query.download ?? false,
    );
    response.set(headers);
    return new StreamableFile(stream);
  }
}
