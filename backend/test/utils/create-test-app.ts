import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';

export interface TestAppOptions {
  /** Listen on a free local port, so socket.io clients can connect. Supertest does not need it. */
  listen?: boolean;
}

/** Boots the full app with the same HTTP setup as production. */
export async function createTestApp({ listen = false }: TestAppOptions = {}): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  if (listen) {
    await app.listen(0, '127.0.0.1');
  } else {
    await app.init();
  }
  return app;
}
