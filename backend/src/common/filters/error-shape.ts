import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@trello/contracts';
import { Prisma } from '../../generated/prisma/client.js';

export interface ErrorShape {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details?: unknown;
}

const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_FAILED,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.TOO_MANY_REQUESTS,
};

const ERROR_CODES = new Set<string>(Object.values(ErrorCode));

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && ERROR_CODES.has(value);
}

function codeForStatus(statusCode: number): ErrorCode {
  return (
    CODE_BY_STATUS[statusCode] ??
    (statusCode >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.VALIDATION_FAILED)
  );
}

function fromHttpException(exception: HttpException): ErrorShape {
  const statusCode = exception.getStatus();
  const fallbackCode = codeForStatus(statusCode);
  const response = exception.getResponse();

  if (typeof response === 'string') {
    return { statusCode, code: fallbackCode, message: response };
  }

  const body = response as { code?: unknown; message?: unknown; details?: unknown };
  const code = isErrorCode(body.code) ? body.code : fallbackCode;

  // Nest's default validation error puts a string[] in `message`.
  if (Array.isArray(body.message)) {
    return { statusCode, code, message: 'Validation failed', details: body.message };
  }

  const message = typeof body.message === 'string' ? body.message : exception.message;
  return body.details === undefined
    ? { statusCode, code, message }
    : { statusCode, code, message, details: body.details };
}

/** Postgres serialization failure and deadlock: the request lost a race and can be retried. */
const RETRYABLE_SQL_STATES = ['40001', '40P01'];

/** P2034 for a failed transaction; P2010 when a raw query inside it was the one aborted. */
function isLostRace(error: Prisma.PrismaClientKnownRequestError): boolean {
  if (error.code === 'P2034') return true;
  if (error.code !== 'P2010') return false;
  const state = (error.meta as { code?: unknown } | undefined)?.code;
  return RETRYABLE_SQL_STATES.some(
    (code) => state === code || error.message.includes(`Code: \`${code}\``),
  );
}

function fromPrismaError(error: Prisma.PrismaClientKnownRequestError): ErrorShape | null {
  if (isLostRace(error)) {
    return {
      statusCode: HttpStatus.CONFLICT,
      code: ErrorCode.CONFLICT,
      message: 'Another change got in the way. Try again.',
    };
  }
  switch (error.code) {
    case 'P2002':
      return {
        statusCode: HttpStatus.CONFLICT,
        code: ErrorCode.CONFLICT,
        message: 'Resource already exists',
      };
    case 'P2003':
      // A parent row was deleted while the insert was in flight.
      return {
        statusCode: HttpStatus.CONFLICT,
        code: ErrorCode.CONFLICT,
        message: 'A related resource was deleted. Reload and try again.',
      };
    case 'P2025':
      return {
        statusCode: HttpStatus.NOT_FOUND,
        code: ErrorCode.NOT_FOUND,
        message: 'Resource not found',
      };
    default:
      return null;
  }
}

const INTERNAL: ErrorShape = {
  statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
  code: ErrorCode.INTERNAL_ERROR,
  message: 'Internal server error',
};

/** Maps any thrown value to the API error shape. Unknown errors never leak details. */
export function toErrorShape(exception: unknown): ErrorShape {
  if (exception instanceof HttpException) return fromHttpException(exception);
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    return fromPrismaError(exception) ?? INTERNAL;
  }
  return INTERNAL;
}
