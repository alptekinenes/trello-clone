import { BadRequestException, ConflictException } from '@nestjs/common';
import { ErrorCode } from '@trello/contracts';

/** The client's view of the order is stale; it should reload and retry. */
export const positionConflict = () =>
  new ConflictException({
    code: ErrorCode.POSITION_CONFLICT,
    message: 'The neighbouring item has moved. Reload and try again.',
  });

export const invalidTarget = (message: string) =>
  new BadRequestException({ code: ErrorCode.INVALID_TARGET, message });
