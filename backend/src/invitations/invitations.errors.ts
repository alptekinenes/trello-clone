import {
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode } from '@trello/contracts';

/** Also used for malformed or replaced tokens, so a wrong guess reveals nothing. */
export const invitationNotFound = () =>
  new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Invitation not found' });

export const invitationExpired = () =>
  new GoneException({
    code: ErrorCode.INVITATION_EXPIRED,
    message: 'This invitation has expired',
  });

export const invitationRevoked = () =>
  new GoneException({
    code: ErrorCode.INVITATION_REVOKED,
    message: 'This invitation was revoked',
  });

/** 410 when someone tries to use an accepted invitation, 409 when an admin tries to revoke it. */
export const invitationUsed = (status: 'gone' | 'conflict') => {
  const body = {
    code: ErrorCode.INVITATION_USED,
    message: 'This invitation was already accepted',
  };
  return status === 'gone' ? new GoneException(body) : new ConflictException(body);
};

export const emailMismatch = () =>
  new ForbiddenException({
    code: ErrorCode.EMAIL_MISMATCH,
    message: 'This invitation was sent to a different email address',
  });

export const alreadyMember = () =>
  new ConflictException({
    code: ErrorCode.ALREADY_MEMBER,
    message: 'This person is already a member of the board',
  });

export const cannotInviteAs = () =>
  new ForbiddenException({
    code: ErrorCode.FORBIDDEN,
    message: 'Only the board owner can invite admins',
  });
