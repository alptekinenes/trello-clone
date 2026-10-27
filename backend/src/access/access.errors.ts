import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '@trello/contracts';

/** Also used for boards the user is not a member of, so their existence stays hidden. */
export const boardNotFound = () =>
  new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Board not found' });

export const insufficientRole = () =>
  new ForbiddenException({
    code: ErrorCode.FORBIDDEN,
    message: 'Your role on this board does not allow this action',
  });
