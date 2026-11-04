import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ErrorCode } from '@trello/contracts';
import request from 'supertest';
import { createTestApp } from './utils/create-test-app.js';

/*
 * HTTP-layer auth checks that never reach the database:
 * validation, missing/invalid tokens, cookie handling and rate limiting.
 * Flows that need stored users are in auth-flow.e2e-spec.ts.
 */

interface FieldError {
  field: string;
  errors: string[];
}

function fieldsOf(body: { details?: FieldError[] }): string[] {
  return (body.details ?? []).map((d) => d.field).sort();
}

describe('Auth (e2e, no database)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  describe('POST /api/v1/auth/register', () => {
    it('rejects an invalid body with field details', async () => {
      const res = await http()
        .post('/api/v1/auth/register')
        .send({ email: 'not-an-email', password: 'short', name: '   ' })
        .expect(400);

      expect(res.body).toMatchObject({ statusCode: 400, code: ErrorCode.VALIDATION_FAILED });
      expect(fieldsOf(res.body)).toEqual(['email', 'name', 'password']);
    });

    it('rejects unknown fields such as a role', async () => {
      const res = await http()
        .post('/api/v1/auth/register')
        .send({ email: 'ayse@example.com', password: 'secret-password', name: 'Ayşe', role: 'ADMIN' })
        .expect(400);

      expect(fieldsOf(res.body)).toEqual(['role']);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('rejects a missing password', async () => {
      const res = await http()
        .post('/api/v1/auth/login')
        .send({ email: 'ayse@example.com' })
        .expect(400);
      expect(fieldsOf(res.body)).toEqual(['password']);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('returns 401 INVALID_REFRESH without a cookie and clears the cookie', async () => {
      const res = await http().post('/api/v1/auth/refresh').expect(401);

      expect(res.body.code).toBe(ErrorCode.INVALID_REFRESH);
      const setCookie = String(res.headers['set-cookie'] ?? '');
      expect(setCookie).toMatch(/^rt=;/);
      expect(setCookie).toContain('Path=/api/v1/auth');
      expect(setCookie).toContain('Expires=Thu, 01 Jan 1970');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('returns 204 and clears the cookie even without a session', async () => {
      const res = await http().post('/api/v1/auth/logout').expect(204);
      expect(String(res.headers['set-cookie'] ?? '')).toMatch(/^rt=;.*HttpOnly.*SameSite=Strict/);
    });
  });

  describe('protected routes', () => {
    it('GET /api/v1/users/me without a token returns 401', async () => {
      const res = await http().get('/api/v1/users/me').expect(401);
      expect(res.body).toMatchObject({ statusCode: 401, code: ErrorCode.UNAUTHORIZED });
    });

    it('rejects a malformed token', async () => {
      await http().get('/api/v1/users/me').set('Authorization', 'Bearer not-a-jwt').expect(401);
    });

    it('rejects a token signed with another secret', async () => {
      const forged = await new JwtService({ secret: 'attacker-secret-attacker-secret-1234' }).signAsync(
        { sub: 'user-1', email: 'ayse@example.com' },
      );
      await http().get('/api/v1/users/me').set('Authorization', `Bearer ${forged}`).expect(401);
    });

    it('rejects an unsigned (alg=none) token', async () => {
      const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: 'user-1', email: 'a@b.c' })}.`;
      await http().get('/api/v1/users/me').set('Authorization', `Bearer ${unsigned}`).expect(401);
    });

    it('keeps the health check public', async () => {
      await http().get('/api/v1/health').expect(200);
    });
  });
});

describe('Auth rate limiting (e2e, no database)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('blocks the 11th login attempt within a minute', async () => {
    const attempt = () =>
      request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: 'bad', password: '' });

    for (let i = 0; i < 10; i += 1) {
      await attempt().expect(400);
    }
    const res = await attempt().expect(429);
    expect(res.body.code).toBe(ErrorCode.TOO_MANY_REQUESTS);
  });
});

describe('Client IP and default rate limit (e2e, no database)', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
    vi.unstubAllEnvs();
  });

  const loginAs = (ip: string) =>
    request(app!.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email: 'bad', password: '' });

  async function exhaustLoginLimit(ip: string): Promise<void> {
    for (let i = 0; i < 10; i += 1) {
      await loginAs(ip).expect(400);
    }
  }

  it('counts clients separately by X-Forwarded-For when TRUST_PROXY=1', async () => {
    vi.stubEnv('TRUST_PROXY', '1');
    app = await createTestApp();

    await exhaustLoginLimit('203.0.113.1');
    await loginAs('203.0.113.1').expect(429);
    await loginAs('203.0.113.2').expect(400);
  });

  it('ignores X-Forwarded-For when TRUST_PROXY=0', async () => {
    vi.stubEnv('TRUST_PROXY', '0');
    app = await createTestApp();

    await exhaustLoginLimit('203.0.113.1');
    await loginAs('203.0.113.2').expect(429);
  });

  it('applies API_RATE_LIMIT_PER_MINUTE to routes without a stricter limit', async () => {
    vi.stubEnv('API_RATE_LIMIT_PER_MINUTE', '3');
    app = await createTestApp();
    const me = () => request(app!.getHttpServer()).get('/api/v1/users/me');

    for (let i = 0; i < 3; i += 1) {
      await me().expect(401);
    }
    const res = await me().expect(429);
    expect(res.body.code).toBe(ErrorCode.TOO_MANY_REQUESTS);
  });
});
