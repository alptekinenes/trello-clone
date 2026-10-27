import { INestApplication } from '@nestjs/common';
import { ErrorCode } from '@trello/contracts';
import request from 'supertest';
import { createTestApp } from './utils/create-test-app.js';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health returns ok', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('serves routes only under the /api/v1 prefix', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });

  it('returns the standard error body for unknown routes', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);
    expect(res.body).toMatchObject({
      statusCode: 404,
      code: ErrorCode.NOT_FOUND,
      path: '/api/v1/does-not-exist',
    });
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('sets security headers', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows CORS for the configured origin and never reflects other origins', async () => {
    const allowed = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const other = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'http://evil.example');
    // The browser blocks the response because the header does not match its origin.
    expect(other.headers['access-control-allow-origin']).not.toBe('http://evil.example');
  });
});
