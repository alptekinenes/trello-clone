import { BadRequestException } from '@nestjs/common';
import { ErrorCode } from '@trello/contracts';

/**
 * The label is on another board or does not exist. Both look the same, so the
 * existence of labels on boards the user cannot see stays hidden.
 */
export const labelNotInBoard = () =>
  new BadRequestException({
    code: ErrorCode.LABEL_NOT_IN_BOARD,
    message: 'The label does not belong to this board',
  });
