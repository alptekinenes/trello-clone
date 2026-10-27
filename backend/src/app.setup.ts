import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { createValidationPipe } from './common/pipes/validation.pipe.js';

export const API_PREFIX = 'api/v1';

/** Shared HTTP setup for main.ts and e2e tests, so tests run the real pipeline. */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  app.setGlobalPrefix(API_PREFIX);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: config.getOrThrow<string>('CORS_ORIGIN'), credentials: true });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter(app.get(HttpAdapterHost)));
  app.enableShutdownHooks();
}
