import { INestApplication } from '@nestjs/common';
import { ErrorCode } from '@trello/contracts';
import request from 'supertest';
import { hashToken } from '../src/auth/token.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './utils/create-test-app.js';
import { resetDatabase } from './utils/database.js';

/* Full auth flows against the test database (trello_test). */

const NEW_USER = { email: 'Ayse@Example.com', password: 'secret-password', name: 'Ayşe' };

function refreshCookieOf(res: request.Response): string {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((c) => c.startsWith('rt='));
  if (!cookie) throw new Error('response has no rt cookie');
  return cookie.split(';')[0];
}

function tokenOf(cookie: string): string {
  return cookie.slice('rt='.length);
}

describe('Auth flows (e2e, database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  // A fresh app per test also resets the in-memory rate limiter.
  beforeEach(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(app);
  });

  afterEach(async () => {
    await app.close();
  });

  const register = () => http().post('/api/v1/auth/register').send(NEW_USER);

  it('registers, then reads and updates the profile with the access token', async () => {
    const res = await register().expect(201);

    expect(res.body.user).toEqual({
      id: expect.any(String),
      email: 'ayse@example.com',
      name: 'Ayşe',
      avatarUrl: null,
    });
    expect(res.body).not.toHaveProperty('refreshToken');
    expect(refreshCookieOf(res)).toMatch(/^rt=.+/);

    const auth = `Bearer ${res.body.accessToken}`;
    const me = await http().get('/api/v1/users/me').set('Authorization', auth).expect(200);
    expect(me.body).toEqual(res.body.user);

    const updated = await http()
      .patch('/api/v1/users/me')
      .set('Authorization', auth)
      .send({ name: '  Ayşe Yılmaz  ', avatarUrl: 'https://example.com/a.png' })
      .expect(200);
    expect(updated.body).toMatchObject({ name: 'Ayşe Yılmaz', avatarUrl: 'https://example.com/a.png' });

    await http()
      .patch('/api/v1/users/me')
      .set('Authorization', auth)
      .send({ avatarUrl: 'http://example.com/a.png' })
      .expect(400);
  });

  it('stores only an argon2id hash of the password and a sha256 of the refresh token', async () => {
    const res = await register().expect(201);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'ayse@example.com' } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(NEW_USER.password);

    const token = tokenOf(refreshCookieOf(res));
    const stored = await prisma.refreshToken.findMany({ where: { userId: user.id } });
    expect(stored).toHaveLength(1);
    expect(stored[0].tokenHash).toBe(hashToken(token));
  });

  it('rejects a duplicate email regardless of case', async () => {
    await register().expect(201);

    const res = await http()
      .post('/api/v1/auth/register')
      .send({ ...NEW_USER, email: 'AYSE@example.com' })
      .expect(409);
    expect(res.body.code).toBe(ErrorCode.EMAIL_TAKEN);
  });

  it('logs in with the right password and rejects a wrong one with the same error as an unknown email', async () => {
    await register().expect(201);

    const ok = await http()
      .post('/api/v1/auth/login')
      .send({ email: 'ayse@example.com', password: NEW_USER.password })
      .expect(200);
    expect(ok.body.user.email).toBe('ayse@example.com');
    expect(refreshCookieOf(ok)).toMatch(/^rt=.+/);

    const wrong = await http()
      .post('/api/v1/auth/login')
      .send({ email: 'ayse@example.com', password: 'wrong-password' })
      .expect(401);
    const unknown = await http()
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong-password' })
      .expect(401);

    expect(wrong.body.code).toBe(ErrorCode.INVALID_CREDENTIALS);
    expect(unknown.body.code).toBe(ErrorCode.INVALID_CREDENTIALS);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('rotates the refresh token and the new access token works', async () => {
    const first = refreshCookieOf(await register().expect(201));

    const res = await http().post('/api/v1/auth/refresh').set('Cookie', first).expect(200);

    const second = refreshCookieOf(res);
    expect(second).not.toBe(first);
    await http()
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);

    // The rotated token is no longer valid; the new one is.
    await http().post('/api/v1/auth/refresh').set('Cookie', first).expect(401);
    await http().post('/api/v1/auth/refresh').set('Cookie', second).expect(200);
  });

  it('a token reused after the grace period revokes the whole family', async () => {
    const first = refreshCookieOf(await register().expect(201));
    const second = refreshCookieOf(
      await http().post('/api/v1/auth/refresh').set('Cookie', first).expect(200),
    );

    // Pretend the rotation happened a minute ago, so the reuse looks like theft.
    await prisma.refreshToken.update({
      where: { tokenHash: hashToken(tokenOf(first)) },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });

    const reuse = await http().post('/api/v1/auth/refresh').set('Cookie', first).expect(401);
    expect(reuse.body.code).toBe(ErrorCode.INVALID_REFRESH);

    // The attacker's stolen token is gone, and so is the legitimate one.
    await http().post('/api/v1/auth/refresh').set('Cookie', second).expect(401);
    const active = await prisma.refreshToken.count({ where: { revokedAt: null } });
    expect(active).toBe(0);
  });

  it('a reuse within the grace period (two tabs) does not sign the user out', async () => {
    const first = refreshCookieOf(await register().expect(201));
    const second = refreshCookieOf(
      await http().post('/api/v1/auth/refresh').set('Cookie', first).expect(200),
    );

    await http().post('/api/v1/auth/refresh').set('Cookie', first).expect(401);

    await http().post('/api/v1/auth/refresh').set('Cookie', second).expect(200);
  });

  it('logout revokes the refresh token', async () => {
    const cookie = refreshCookieOf(await register().expect(201));

    await http().post('/api/v1/auth/logout').set('Cookie', cookie).expect(204);

    await http().post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401);
  });

  it('treats an access token of a deleted user as signed out', async () => {
    const res = await register().expect(201);
    await prisma.user.delete({ where: { id: res.body.user.id } });
    const auth = `Bearer ${res.body.accessToken}`;

    const read = await http().get('/api/v1/users/me').set('Authorization', auth).expect(401);
    const write = await http()
      .patch('/api/v1/users/me')
      .set('Authorization', auth)
      .send({ name: 'Ayşe' })
      .expect(401);
    expect(read.body.code).toBe(ErrorCode.UNAUTHORIZED);
    expect(write.body.code).toBe(ErrorCode.UNAUTHORIZED);
  });
});
