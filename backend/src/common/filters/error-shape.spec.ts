import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode } from '@trello/contracts';
import { Prisma } from '../../generated/prisma/client.js';
import { toErrorShape } from './error-shape.js';

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('db error', { code, clientVersion: 'test' });
}

describe('toErrorShape', () => {
  it('uses the status-based code for a plain HttpException', () => {
    expect(toErrorShape(new NotFoundException('Board not found'))).toEqual({
      statusCode: HttpStatus.NOT_FOUND,
      code: ErrorCode.NOT_FOUND,
      message: 'Board not found',
    });
  });

  it('keeps a domain error code given in the exception body', () => {
    const shape = toErrorShape(
      new ConflictException({ code: ErrorCode.EMAIL_TAKEN, message: 'Email is already registered' }),
    );
    expect(shape).toEqual({
      statusCode: HttpStatus.CONFLICT,
      code: ErrorCode.EMAIL_TAKEN,
      message: 'Email is already registered',
    });
  });

  it('ignores an unknown code in the exception body', () => {
    const shape = toErrorShape(new ForbiddenException({ code: 'NOPE', message: 'No access' }));
    expect(shape.code).toBe(ErrorCode.FORBIDDEN);
  });

  it('moves Nest validation messages into details', () => {
    const shape = toErrorShape(new BadRequestException(['title must be a string']));
    expect(shape).toEqual({
      statusCode: HttpStatus.BAD_REQUEST,
      code: ErrorCode.VALIDATION_FAILED,
      message: 'Validation failed',
      details: ['title must be a string'],
    });
  });

  it('keeps details given in the exception body', () => {
    const details = [{ field: 'title', errors: ['too long'] }];
    const shape = toErrorShape(
      new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Validation failed',
        details,
      }),
    );
    expect(shape.details).toEqual(details);
  });

  it('maps Prisma unique violation (P2002) to 409', () => {
    expect(toErrorShape(prismaError('P2002'))).toMatchObject({
      statusCode: HttpStatus.CONFLICT,
      code: ErrorCode.CONFLICT,
    });
  });

  it('maps a foreign key violation (P2003) to 409', () => {
    expect(toErrorShape(prismaError('P2003'))).toMatchObject({
      statusCode: HttpStatus.CONFLICT,
      code: ErrorCode.CONFLICT,
    });
  });

  it('maps a deadlock or write conflict to a retryable 409', () => {
    const rawDeadlock = new Prisma.PrismaClientKnownRequestError(
      'Raw query failed. Code: `40P01`. Message: `deadlock detected`',
      { code: 'P2010', clientVersion: 'test' },
    );
    for (const error of [prismaError('P2034'), rawDeadlock]) {
      expect(toErrorShape(error)).toEqual({
        statusCode: HttpStatus.CONFLICT,
        code: ErrorCode.CONFLICT,
        message: 'Another change got in the way. Try again.',
      });
    }
  });

  it('keeps other raw query failures internal', () => {
    const syntax = new Prisma.PrismaClientKnownRequestError(
      'Raw query failed. Code: `42601`. Message: `syntax error`',
      { code: 'P2010', clientVersion: 'test' },
    );
    expect(toErrorShape(syntax).statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('maps Prisma record not found (P2025) to 404', () => {
    expect(toErrorShape(prismaError('P2025'))).toMatchObject({
      statusCode: HttpStatus.NOT_FOUND,
      code: ErrorCode.NOT_FOUND,
    });
  });

  it('hides other Prisma errors behind a 500', () => {
    expect(toErrorShape(prismaError('P1001'))).toEqual({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Internal server error',
    });
  });

  it('hides unknown errors behind a 500 without leaking the message', () => {
    const shape = toErrorShape(new Error('secret connection string'));
    expect(shape.statusCode).toBe(500);
    expect(shape.message).toBe('Internal server error');
  });
});
