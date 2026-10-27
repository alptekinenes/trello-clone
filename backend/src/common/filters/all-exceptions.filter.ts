import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { ApiErrorBody } from '@trello/contracts';
import { toErrorShape } from './error-shape.js';

/** Sends every error as an ApiErrorBody. 5xx errors are logged with their stack. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const shape = toErrorShape(exception);

    if (shape.statusCode >= 500) {
      this.logger.error(
        exception instanceof Error ? (exception.stack ?? exception.message) : exception,
      );
    }

    const body: ApiErrorBody = {
      ...shape,
      path: httpAdapter.getRequestUrl(ctx.getRequest()) as string,
      timestamp: new Date().toISOString(),
    };
    httpAdapter.reply(ctx.getResponse(), body, shape.statusCode);
  }
}
