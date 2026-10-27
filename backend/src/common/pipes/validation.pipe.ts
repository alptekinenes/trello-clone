import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { ErrorCode } from '@trello/contracts';

export interface FieldError {
  field: string;
  errors: string[];
}

/** Flattens nested class-validator errors into `{ field: 'a.b', errors }` entries. */
export function flattenValidationErrors(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = error.constraints ? [{ field, errors: Object.values(error.constraints) }] : [];
    return [...own, ...flattenValidationErrors(error.children ?? [], field)];
  });
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Validation failed',
        details: flattenValidationErrors(errors),
      }),
  });
}
