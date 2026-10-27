import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '@trello/contracts';

export const memberNotFound = () =>
  new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Member not found' });

export const cannotChangeOwner = () =>
  new BadRequestException({
    code: ErrorCode.CANNOT_CHANGE_OWNER,
    message: "The board owner's role cannot be changed",
  });

export const ownerCannotLeave = () =>
  new BadRequestException({
    code: ErrorCode.OWNER_CANNOT_LEAVE,
    message: 'The board owner cannot leave the board',
  });
