import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ErrorCode } from '@trello/contracts';

export const emailTaken = () =>
  new ConflictException({ code: ErrorCode.EMAIL_TAKEN, message: 'Email is already registered' });

export const invalidCredentials = () =>
  new UnauthorizedException({
    code: ErrorCode.INVALID_CREDENTIALS,
    message: 'Email or password is incorrect',
  });

export const invalidRefresh = () =>
  new UnauthorizedException({
    code: ErrorCode.INVALID_REFRESH,
    message: 'Session expired, please sign in again',
  });

export const invalidAccessToken = () =>
  new UnauthorizedException({
    code: ErrorCode.UNAUTHORIZED,
    message: 'Missing, invalid or expired access token',
  });
