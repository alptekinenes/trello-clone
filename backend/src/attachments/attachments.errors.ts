import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ATTACHMENT_LIMITS, ErrorCode } from '@trello/contracts';

export const attachmentLimitReached = () =>
  new ConflictException({
    code: ErrorCode.ATTACHMENT_LIMIT_REACHED,
    message: `A card can have at most ${ATTACHMENT_LIMITS.MAX_PER_CARD} attachments`,
  });

export const unsupportedFileType = () =>
  new UnsupportedMediaTypeException({
    code: ErrorCode.UNSUPPORTED_FILE_TYPE,
    message: 'This file type is not supported',
  });

export const fileRequired = () =>
  new BadRequestException({
    code: ErrorCode.VALIDATION_FAILED,
    message: 'Send exactly one non-empty file in the "file" field',
  });

/** Only the uploader, or ADMIN+, deletes an attachment. */
export const notAttachmentUploader = () =>
  new ForbiddenException({
    code: ErrorCode.FORBIDDEN,
    message: 'Only the uploader or a board admin can delete this attachment',
  });
