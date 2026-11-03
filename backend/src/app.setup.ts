import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { RejectNulPipe } from './common/pipes/reject-nul.pipe.js';
import { createValidationPipe } from './common/pipes/validation.pipe.js';
import { RealtimeIoAdapter } from './realtime/realtime-io.adapter.js';
import { API_PREFIX } from './app.constants.js';

/** Shared HTTP setup for main.ts and e2e tests, so tests run the real pipeline. */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  app.setGlobalPrefix(API_PREFIX);
  app.use(helmet());
  app.use(cookieParser());
  const corsOrigin = config.getOrThrow<string>('CORS_ORIGIN');
  app.enableCors({ origin: corsOrigin, credentials: true });
  app.useWebSocketAdapter(new RealtimeIoAdapter(app, corsOrigin));
  app.useGlobalPipes(new RejectNulPipe(), createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter(app.get(HttpAdapterHost)));
  app.enableShutdownHooks();
}
