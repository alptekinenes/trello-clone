import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ErrorCode } from '@trello/contracts';

/** Only the author edits a comment; ADMIN+ may delete but not edit. */
export const notCommentAuthor = () =>
  new ForbiddenException({
    code: ErrorCode.FORBIDDEN,
    message: 'Only the author can do this to a comment',
  });

/** The cursor is not one this server made. */
export const badCursor = () =>
  new BadRequestException({
    code: ErrorCode.VALIDATION_FAILED,
    message: 'The cursor is not valid',
  });
