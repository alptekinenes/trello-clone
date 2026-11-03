import { type ArgumentMetadata, BadRequestException, type PipeTransform } from '@nestjs/common';
import { ErrorCode } from '@trello/contracts';

/** Deeper input is left to the validation pipe; request bodies here are flat. */
const MAX_DEPTH = 16;

/** True when a string anywhere in `value` contains U+0000. */
export function containsNul(value: unknown, depth = 0): boolean {
  if (typeof value === 'string') return value.includes('\u0000');
  if (value === null || typeof value !== 'object' || depth >= MAX_DEPTH) return false;
  return Object.values(value).some((item) => containsNul(item, depth + 1));
}

/**
 * Only what the client wrote is checked. Values that custom decorators and gateways inject
 * (the user, a socket) are not input, and walking a socket's object graph blocked the event loop
 * for seconds on every `board:join`.
 */
const INPUT_TYPES: ReadonlySet<ArgumentMetadata['type']> = new Set(['body', 'query', 'param']);

/**
 * Postgres text cannot store U+0000, so such input is refused with 400 up
 * front instead of failing as a 500 in the database.
 */
export class RejectNulPipe implements PipeTransform {
  transform(value: unknown, metadata?: ArgumentMetadata): unknown {
    if (metadata && !INPUT_TYPES.has(metadata.type)) return value;
    if (containsNul(value)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Text must not contain the NUL character',
      });
    }
    return value;
  }
}
