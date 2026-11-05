import { BadRequestException } from '@nestjs/common';
import { ErrorCode } from '@trello/contracts';

/** The target user is not on the board (or does not exist); both look the same. */
export const notBoardMember = () =>
  new BadRequestException({
    code: ErrorCode.NOT_BOARD_MEMBER,
    message: 'The user is not a member of this board',
  });
