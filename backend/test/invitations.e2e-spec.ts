import { INestApplication } from '@nestjs/common';
import {
  type BoardDetailDto,
  type BoardSummaryDto,
  type CreateInvitationResponse,
  ErrorCode,
  type InvitationDto,
} from '@trello/contracts';
import request from 'supertest';
import { hashToken } from '../src/common/crypto/opaque-token.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { addMember, createBoard, MISSING_ID } from './utils/board-fixtures.js';
import { createTestApp } from './utils/create-test-app.js';
import { resetDatabase } from './utils/database.js';
import { freshEmail, invite, tokenOf } from './utils/invitations.js';
import { createUser, type TestUser } from './utils/users.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const INVITE_URL = /^http:\/\/localhost:5173\/invitations\/[A-Za-z0-9_-]{43}$/;

describe('Invitations (e2e, database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: TestUser;
  let boardId: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    // Supertest attaches listeners per request; the race tests fire ten at once.
    app.getHttpServer().setMaxListeners(50);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    owner = await createUser(app, 'Sahip');
    boardId = await createBoard(app, owner, 'Yol haritası');
  });

  function post(body: object, as: TestUser | null = owner, board = boardId) {
    const req = http().post(`/api/v1/boards/${board}/invitations`);
    return (as ? req.set('Authorization', as.auth) : req).send(body);
  }

  function list(as: TestUser = owner, board = boardId) {
    return http().get(`/api/v1/boards/${board}/invitations`).set('Authorization', as.auth);
  }

  function revoke(invitationId: string, as: TestUser = owner, board = boardId) {
    return http()
      .delete(`/api/v1/boards/${board}/invitations/${invitationId}`)
      .set('Authorization', as.auth);
  }

  function previewOf(token: string) {
    return http().get(`/api/v1/invitations/${token}`);
  }

  function accept(token: string, as: TestUser, body: object = {}) {
    return http()
      .post(`/api/v1/invitations/${token}/accept`)
      .set('Authorization', as.auth)
      .send(body);
  }

  function rowOf(invitationId: string) {
    return prisma.invitation.findUniqueOrThrow({ where: { id: invitationId } });
  }

  describe('create', () => {
    it('adds a registered address as a member right away', async () => {
      const mehmet = await createUser(app, 'Mehmet');

      const res = await post({ email: mehmet.user.email, role: 'ADMIN' }).expect(201);

      const body = res.body as CreateInvitationResponse;
      expect(body.result).toBe('MEMBER_ADDED');
      if (body.result !== 'MEMBER_ADDED') return;
      expect(body.member).toMatchObject({
        userId: mehmet.user.id,
        name: 'Mehmet',
        email: mehmet.user.email,
        role: 'ADMIN',
      });
      expect(await prisma.invitation.count()).toBe(0);

      const detail = await http()
        .get(`/api/v1/boards/${boardId}`)
        .set('Authorization', owner.auth)
        .expect(200);
      expect((detail.body as BoardDetailDto).members.map((m) => m.userId)).toContain(
        mehmet.user.id,
      );

      const boards = await http().get('/api/v1/boards').set('Authorization', mehmet.auth).expect(200);
      expect((boards.body as BoardSummaryDto[]).find((b) => b.id === boardId)?.myRole).toBe('ADMIN');
    });

    it('matches a registered address regardless of case and surrounding spaces', async () => {
      const davetli = await createUser(app, 'Davetli', 'davetli@example.com');

      const res = await post({ email: ' Davetli@Example.COM ', role: 'MEMBER' }).expect(201);

      expect(res.body).toMatchObject({
        result: 'MEMBER_ADDED',
        member: { userId: davetli.user.id, role: 'MEMBER' },
      });
    });

    it('creates an invitation for an unregistered address and keeps only the token hash', async () => {
      const res = await post({ email: ' Yeni.Kisi@Example.COM ', role: 'MEMBER' }).expect(201);

      const body = res.body as CreateInvitationResponse;
      expect(body.result).toBe('INVITATION_CREATED');
      if (body.result !== 'INVITATION_CREATED') return;
      expect(body.inviteUrl).toMatch(INVITE_URL);
      expect(body.invitation).toMatchObject({
        boardId,
        email: 'yeni.kisi@example.com',
        role: 'MEMBER',
        invitedBy: { userId: owner.user.id, name: 'Sahip' },
      });
      expect(JSON.stringify(body.invitation)).not.toContain(tokenOf(body.inviteUrl));

      const row = await rowOf(body.invitation.id);
      const token = tokenOf(body.inviteUrl);
      expect(row.tokenHash).toBe(hashToken(token));
      expect(row.status).toBe('PENDING');
      expect(row.email).toBe('yeni.kisi@example.com');
      expect(JSON.stringify(row)).not.toContain(token);
      const lifetime = row.expiresAt.getTime() - Date.now();
      expect(lifetime).toBeGreaterThan(7 * DAY_MS - 60_000);
      expect(lifetime).toBeLessThanOrEqual(7 * DAY_MS);
    });

    it('replaces the token, role and expiry when the same address is invited again', async () => {
      const email = freshEmail();
      const first = await invite(app, owner, boardId, email, 'MEMBER');

      const second = await invite(app, owner, boardId, email, 'ADMIN');

      expect(second.invitation.id).toBe(first.invitation.id);
      expect(second.token).not.toBe(first.token);
      expect(await prisma.invitation.count()).toBe(1);
      const row = await rowOf(first.invitation.id);
      expect(row.tokenHash).toBe(hashToken(second.token));
      expect(row.role).toBe('ADMIN');
      expect(row.status).toBe('PENDING');
      expect(new Date(second.invitation.expiresAt).getTime()).toBeGreaterThanOrEqual(
        new Date(first.invitation.expiresAt).getTime(),
      );
    });

    it('revives an expired or revoked invitation with a fresh token', async () => {
      const email = freshEmail();
      const first = await invite(app, owner, boardId, email);
      await prisma.invitation.update({
        where: { id: first.invitation.id },
        data: { expiresAt: new Date(Date.now() - DAY_MS) },
      });
      expect((await list().expect(200)).body).toEqual([]);

      const afterExpiry = await invite(app, owner, boardId, email);
      expect((await rowOf(first.invitation.id)).tokenHash).toBe(hashToken(afterExpiry.token));
      expect((await list().expect(200)).body).toHaveLength(1);

      await revoke(first.invitation.id).expect(204);
      const afterRevoke = await invite(app, owner, boardId, email);

      const row = await rowOf(first.invitation.id);
      expect(row.status).toBe('PENDING');
      expect(row.tokenHash).toBe(hashToken(afterRevoke.token));
      expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * DAY_MS);
    });

    it('answers 409 ALREADY_MEMBER for an address that is a member already (owner included)', async () => {
      const member = await addMember(app, boardId, 'MEMBER');

      const forMember = await post({ email: member.user.email, role: 'MEMBER' }).expect(409);
      const forOwner = await post({ email: owner.user.email, role: 'MEMBER' }).expect(409);

      expect(forMember.body.code).toBe(ErrorCode.ALREADY_MEMBER);
      expect(forOwner.body.code).toBe(ErrorCode.ALREADY_MEMBER);
    });

    it('marks a pending invitation accepted when its address is added directly later', async () => {
      const email = freshEmail('later');
      const pending = await invite(app, owner, boardId, email);
      const later = await createUser(app, 'Sonradan', email);

      const res = await post({ email, role: 'ADMIN' }).expect(201);

      expect(res.body).toMatchObject({
        result: 'MEMBER_ADDED',
        member: { userId: later.user.id, role: 'ADMIN' },
      });
      const row = await rowOf(pending.invitation.id);
      expect(row.status).toBe('ACCEPTED');
      expect(row.acceptedAt).not.toBeNull();
    });

    describe('authorization and validation', () => {
      it('lets an admin invite members but not admins; the owner may invite both', async () => {
        const admin = await addMember(app, boardId, 'ADMIN', 'Yönetici');

        await post({ email: freshEmail(), role: 'MEMBER' }, admin).expect(201);
        const denied = await post({ email: freshEmail(), role: 'ADMIN' }, admin).expect(403);
        await post({ email: freshEmail(), role: 'ADMIN' }, owner).expect(201);

        expect(denied.body.code).toBe(ErrorCode.FORBIDDEN);
        expect(await prisma.invitation.count()).toBe(2);
      });

      it('rejects the OWNER role', async () => {
        const res = await post({ email: freshEmail(), role: 'OWNER' }).expect(400);
        expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
      });

      it('forbids plain members on every invitation route', async () => {
        const member = await addMember(app, boardId, 'MEMBER');
        const pending = await invite(app, owner, boardId);

        await post({ email: freshEmail(), role: 'MEMBER' }, member).expect(403);
        await list(member).expect(403);
        await revoke(pending.invitation.id, member).expect(403);
        expect((await rowOf(pending.invitation.id)).status).toBe('PENDING');
      });

      it('hides the board from outsiders with 404', async () => {
        const stranger = await createUser(app, 'Yabancı');
        const pending = await invite(app, owner, boardId);

        const created = await post({ email: freshEmail(), role: 'MEMBER' }, stranger).expect(404);
        await list(stranger).expect(404);
        await revoke(pending.invitation.id, stranger).expect(404);

        expect(created.body.message).toBe('Board not found');
      });

      it('requires authentication', async () => {
        await post({ email: freshEmail(), role: 'MEMBER' }, null).expect(401);
        await http().get(`/api/v1/boards/${boardId}/invitations`).expect(401);
        await http().delete(`/api/v1/boards/${boardId}/invitations/${MISSING_ID}`).expect(401);
      });

      it.each([
        ['an invalid email', { email: 'nope', role: 'MEMBER' }],
        ['an email longer than 254 characters', { email: `${'a'.repeat(250)}@x.io`, role: 'MEMBER' }],
        ['a missing email', { role: 'MEMBER' }],
        ['a missing role', { email: 'a@example.com' }],
        ['an unknown role', { email: 'a@example.com', role: 'BOSS' }],
        ['an extra field', { email: 'a@example.com', role: 'MEMBER', boardId: MISSING_ID }],
      ])('rejects %s with 400', async (_, body) => {
        const res = await post(body).expect(400);
        expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
        expect(await prisma.invitation.count()).toBe(0);
      });
    });
  });

  describe('list', () => {
    it('returns pending, unexpired invitations of this board, newest first, without tokens', async () => {
      const first = await invite(app, owner, boardId);
      const expired = await invite(app, owner, boardId);
      const revoked = await invite(app, owner, boardId);
      const accepted = await invite(app, owner, boardId);
      const second = await invite(app, owner, boardId);
      await prisma.invitation.update({
        where: { id: expired.invitation.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await prisma.invitation.update({
        where: { id: revoked.invitation.id },
        data: { status: 'REVOKED' },
      });
      await prisma.invitation.update({
        where: { id: accepted.invitation.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });
      const otherBoard = await createBoard(app, owner, 'Başka');
      await invite(app, owner, otherBoard);

      const res = await list().expect(200);

      const invitations = res.body as InvitationDto[];
      expect(invitations.map((i) => i.id)).toEqual([second.invitation.id, first.invitation.id]);
      const raw = JSON.stringify(res.body);
      for (const created of [first, second]) {
        expect(raw).not.toContain(created.token);
        expect(raw).not.toContain(hashToken(created.token));
      }
      for (const entry of invitations) {
        expect(Object.keys(entry).sort()).toEqual(
          ['boardId', 'email', 'expiresAt', 'id', 'invitedBy', 'role'].sort(),
        );
        expect(entry.boardId).toBe(boardId);
      }
    });

    it('puts a re-invited address back on top', async () => {
      const emailA = freshEmail('a');
      const a = await invite(app, owner, boardId, emailA);
      const b = await invite(app, owner, boardId);

      await invite(app, owner, boardId, emailA);

      const res = await list().expect(200);
      expect((res.body as InvitationDto[]).map((i) => i.id)).toEqual([
        a.invitation.id,
        b.invitation.id,
      ]);
    });
  });

  describe('revoke', () => {
    it('revokes a pending invitation; revoking again is fine', async () => {
      const pending = await invite(app, owner, boardId);

      await revoke(pending.invitation.id).expect(204);
      await revoke(pending.invitation.id).expect(204);

      expect((await rowOf(pending.invitation.id)).status).toBe('REVOKED');
      expect((await list().expect(200)).body).toEqual([]);
    });

    it('answers 409 INVITATION_USED for an accepted invitation', async () => {
      const pending = await invite(app, owner, boardId);
      await prisma.invitation.update({
        where: { id: pending.invitation.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });

      const res = await revoke(pending.invitation.id).expect(409);

      expect(res.body.code).toBe(ErrorCode.INVITATION_USED);
      expect((await rowOf(pending.invitation.id)).status).toBe('ACCEPTED');
    });

    it('answers 404 for an invitation of another board and for a missing one', async () => {
      const otherBoard = await createBoard(app, owner, 'Başka');
      const foreign = await invite(app, owner, otherBoard);

      await revoke(foreign.invitation.id).expect(404);
      await revoke(MISSING_ID).expect(404);

      expect((await rowOf(foreign.invitation.id)).status).toBe('PENDING');
    });

    it('answers 400 for a malformed invitation id', async () => {
      const res = await revoke('not-a-uuid').expect(400);
      expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
    });

    it('lets an admin revoke', async () => {
      const admin = await addMember(app, boardId, 'ADMIN');
      const pending = await invite(app, owner, boardId);

      await revoke(pending.invitation.id, admin).expect(204);
    });
  });

  describe("an owner's waiting admin invitation", () => {
    let admin: TestUser;
    let email: string;
    let ownerInvite: Awaited<ReturnType<typeof invite>>;

    beforeEach(async () => {
      admin = await addMember(app, boardId, 'ADMIN', 'Yönetici');
      email = freshEmail('x');
      ownerInvite = await invite(app, owner, boardId, email, 'ADMIN');
    });

    async function expectUntouched() {
      const row = await rowOf(ownerInvite.invitation.id);
      expect(row).toMatchObject({
        role: 'ADMIN',
        status: 'PENDING',
        invitedById: owner.user.id,
        tokenHash: hashToken(ownerInvite.token),
      });
      const res = await previewOf(ownerInvite.token).expect(200);
      expect(res.body.role).toBe('ADMIN');
    }

    it('cannot be replaced by an admin inviting the address as a member', async () => {
      const res = await post({ email, role: 'MEMBER' }, admin).expect(403);

      expect(res.body.code).toBe(ErrorCode.FORBIDDEN);
      await expectUntouched();
    });

    it('cannot be cancelled by an admin', async () => {
      const res = await revoke(ownerInvite.invitation.id, admin).expect(403);

      expect(res.body.code).toBe(ErrorCode.FORBIDDEN);
      await expectUntouched();
    });

    it('cannot be settled by an admin once the address has registered', async () => {
      const later = await createUser(app, 'Sonradan', email);

      await post({ email, role: 'MEMBER' }, admin).expect(403);

      expect(await prisma.boardMember.count({ where: { userId: later.user.id } })).toBe(0);
      await expectUntouched();
      await accept(ownerInvite.token, later).expect(200);
      const member = await prisma.boardMember.findUniqueOrThrow({
        where: { boardId_userId: { boardId, userId: later.user.id } },
      });
      expect(member.role).toBe('ADMIN');
    });

    it('stays replaceable and cancellable by the owner', async () => {
      const again = await invite(app, owner, boardId, email, 'MEMBER');
      expect(again.invitation.id).toBe(ownerInvite.invitation.id);
      expect((await rowOf(again.invitation.id)).tokenHash).toBe(hashToken(again.token));

      const adminAgain = await invite(app, owner, boardId, email, 'ADMIN');
      await revoke(adminAgain.invitation.id, owner).expect(204);

      expect((await rowOf(adminAgain.invitation.id)).status).toBe('REVOKED');
    });

    it('becomes free for an admin again once it expired or was revoked', async () => {
      await prisma.invitation.update({
        where: { id: ownerInvite.invitation.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await post({ email, role: 'MEMBER' }, admin).expect(201);

      const revoked = await invite(app, owner, boardId, freshEmail('y'), 'ADMIN');
      await revoke(revoked.invitation.id, owner).expect(204);
      await post({ email: revoked.invitation.email, role: 'MEMBER' }, admin).expect(201);
    });

    it('does not change what an admin may do with a waiting member invitation', async () => {
      const memberEmail = freshEmail('m');
      const waiting = await invite(app, owner, boardId, memberEmail, 'MEMBER');

      const again = await invite(app, admin, boardId, memberEmail, 'MEMBER');
      expect(again.invitation.id).toBe(waiting.invitation.id);
      expect((await rowOf(waiting.invitation.id)).invitedById).toBe(admin.user.id);
      await revoke(waiting.invitation.id, admin).expect(204);

      expect((await rowOf(waiting.invitation.id)).status).toBe('REVOKED');
    });

    it('is refused to an admin racing the owner to replace it', async () => {
      for (let round = 0; round < 5; round++) {
        const raceEmail = freshEmail('race');
        const first = await invite(app, owner, boardId, raceEmail, 'ADMIN');

        const [byAdmin, byOwner] = await Promise.all([
          post({ email: raceEmail, role: 'MEMBER' }, admin),
          post({ email: raceEmail, role: 'ADMIN' }, owner),
        ]);

        // Whichever runs first, the admin meets a waiting admin invitation and is refused.
        expect(byAdmin.status).toBe(403);
        expect(byOwner.status).toBe(201);
        const row = await rowOf(first.invitation.id);
        const ownerToken = tokenOf((byOwner.body as { inviteUrl: string }).inviteUrl);
        expect(row).toMatchObject({
          role: 'ADMIN',
          status: 'PENDING',
          invitedById: owner.user.id,
          tokenHash: hashToken(ownerToken),
        });
      }
    });
  });

  describe('preview', () => {
    it('shows the invited person exactly what they need, without signing in', async () => {
      const email = freshEmail();
      const { token, invitation } = await invite(app, owner, boardId, email, 'ADMIN');

      const res = await previewOf(token).expect(200);

      expect(res.body).toEqual({
        boardTitle: 'Yol haritası',
        inviterName: 'Sahip',
        email,
        role: 'ADMIN',
        expiresAt: invitation.expiresAt,
      });
    });

    it('tells caches not to keep the response, since it carries an email address', async () => {
      const { token } = await invite(app, owner, boardId);

      const res = await previewOf(token).expect(200);

      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('answers 404 for malformed and unknown tokens', async () => {
      for (const token of ['abc', 'A'.repeat(44), 'A'.repeat(43)]) {
        const res = await previewOf(token).expect(404);
        expect(res.body.code).toBe(ErrorCode.NOT_FOUND);
      }
    });

    it('answers 410 for expired, revoked and accepted invitations', async () => {
      const expired = await invite(app, owner, boardId);
      await prisma.invitation.update({
        where: { id: expired.invitation.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const revoked = await invite(app, owner, boardId);
      await revoke(revoked.invitation.id).expect(204);
      const accepted = await invite(app, owner, boardId);
      await prisma.invitation.update({
        where: { id: accepted.invitation.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });

      const codes = [];
      for (const { token } of [expired, revoked, accepted]) {
        codes.push((await previewOf(token).expect(410)).body.code);
      }

      expect(codes).toEqual([
        ErrorCode.INVITATION_EXPIRED,
        ErrorCode.INVITATION_REVOKED,
        ErrorCode.INVITATION_USED,
      ]);
    });

    it('stops honouring the old link once the address is invited again', async () => {
      const email = freshEmail();
      const first = await invite(app, owner, boardId, email, 'MEMBER');
      const second = await invite(app, owner, boardId, email, 'ADMIN');

      await previewOf(first.token).expect(404);
      const res = await previewOf(second.token).expect(200);

      expect(res.body.role).toBe('ADMIN');
    });
  });

  describe('accept', () => {
    it('makes the invited account a member with the invited role', async () => {
      const email = freshEmail();
      const { token, invitation } = await invite(app, owner, boardId, email, 'ADMIN');
      const davetli = await createUser(app, 'Davetli', email);

      const res = await accept(token, davetli).expect(200);

      expect(res.body).toEqual({ boardId });
      const member = await prisma.boardMember.findUniqueOrThrow({
        where: { boardId_userId: { boardId, userId: davetli.user.id } },
      });
      expect(member.role).toBe('ADMIN');
      const row = await rowOf(invitation.id);
      expect(row.status).toBe('ACCEPTED');
      expect(row.acceptedAt).not.toBeNull();
      await http()
        .get(`/api/v1/boards/${boardId}`)
        .set('Authorization', davetli.auth)
        .expect(200);
      expect((await list().expect(200)).body).toEqual([]);
    });

    it('is idempotent while the user is still a member', async () => {
      const email = freshEmail();
      const { token } = await invite(app, owner, boardId, email);
      const davetli = await createUser(app, 'Davetli', email);

      await accept(token, davetli).expect(200);
      const again = await accept(token, davetli).expect(200);

      expect(again.body).toEqual({ boardId });
      expect(await prisma.boardMember.count({ where: { boardId, userId: davetli.user.id } })).toBe(1);
    });

    it('answers 403 EMAIL_MISMATCH for another account and keeps the invitation pending', async () => {
      const { token, invitation } = await invite(app, owner, boardId);
      const other = await createUser(app, 'Başkası');

      const res = await accept(token, other).expect(403);

      expect(res.body.code).toBe(ErrorCode.EMAIL_MISMATCH);
      expect(await prisma.boardMember.count({ where: { userId: other.user.id } })).toBe(0);
      expect((await rowOf(invitation.id)).status).toBe('PENDING');
    });

    it('does not let someone who accepted and then left come back with the same link', async () => {
      const email = freshEmail();
      const { token } = await invite(app, owner, boardId, email);
      const davetli = await createUser(app, 'Davetli', email);
      await accept(token, davetli).expect(200);
      await http()
        .delete(`/api/v1/boards/${boardId}/members/${davetli.user.id}`)
        .set('Authorization', davetli.auth)
        .expect(204);

      const res = await accept(token, davetli).expect(410);

      expect(res.body.code).toBe(ErrorCode.INVITATION_USED);
      expect(await prisma.boardMember.count({ where: { userId: davetli.user.id } })).toBe(0);
    });

    it('answers 410 for expired and revoked invitations', async () => {
      const emailA = freshEmail();
      const emailB = freshEmail();
      const expired = await invite(app, owner, boardId, emailA);
      const revoked = await invite(app, owner, boardId, emailB);
      const a = await createUser(app, 'A', emailA);
      const b = await createUser(app, 'B', emailB);
      await prisma.invitation.update({
        where: { id: expired.invitation.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await revoke(revoked.invitation.id).expect(204);

      const expiredRes = await accept(expired.token, a).expect(410);
      const revokedRes = await accept(revoked.token, b).expect(410);

      expect(expiredRes.body.code).toBe(ErrorCode.INVITATION_EXPIRED);
      expect(revokedRes.body.code).toBe(ErrorCode.INVITATION_REVOKED);
      expect(await prisma.boardMember.count({ where: { userId: { in: [a.user.id, b.user.id] } } })).toBe(0);
    });

    it('answers 404 for malformed and unknown tokens', async () => {
      const user = await createUser(app, 'Biri');

      await accept('abc', user).expect(404);
      await accept('A'.repeat(43), user).expect(404);
    });

    it('requires authentication', async () => {
      const { token } = await invite(app, owner, boardId);

      await http().post(`/api/v1/invitations/${token}/accept`).expect(401);
    });

    it('rejects a request body', async () => {
      const email = freshEmail();
      const { token } = await invite(app, owner, boardId, email);
      const davetli = await createUser(app, 'Davetli', email);

      const res = await accept(token, davetli, { role: 'ADMIN' }).expect(400);

      expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(await prisma.boardMember.count({ where: { userId: davetli.user.id } })).toBe(0);
    });

    it('keeps the role of someone who became a member in the meantime', async () => {
      const email = freshEmail();
      const { token, invitation } = await invite(app, owner, boardId, email, 'ADMIN');
      const davetli = await createUser(app, 'Davetli', email);
      await prisma.boardMember.create({
        data: { boardId, userId: davetli.user.id, role: 'MEMBER' },
      });

      await accept(token, davetli).expect(200);

      const member = await prisma.boardMember.findUniqueOrThrow({
        where: { boardId_userId: { boardId, userId: davetli.user.id } },
      });
      expect(member.role).toBe('MEMBER');
      expect((await rowOf(invitation.id)).status).toBe('ACCEPTED');
    });

    it('lets the old link still work after the address was added directly', async () => {
      const email = freshEmail();
      const { token } = await invite(app, owner, boardId, email);
      const davetli = await createUser(app, 'Davetli', email);
      await post({ email, role: 'MEMBER' }).expect(201);

      const res = await accept(token, davetli).expect(200);

      expect(res.body).toEqual({ boardId });
    });
  });

  describe('accept races (5 rounds each)', () => {
    const ROUNDS = 5;

    it('adds one membership for ten parallel accepts of one link', async () => {
      for (let round = 0; round < ROUNDS; round++) {
        const email = freshEmail('par');
        const { token } = await invite(app, owner, boardId, email);
        const davetli = await createUser(app, 'Davetli', email);

        const responses = await Promise.all(
          Array.from({ length: 10 }, () => accept(token, davetli)),
        );

        for (const res of responses) {
          expect(res.status).toBe(200);
          expect(res.body).toEqual({ boardId });
        }
        expect(
          await prisma.boardMember.count({ where: { boardId, userId: davetli.user.id } }),
        ).toBe(1);
      }
    });

    it('resolves accept against revoke one way or the other, never both', async () => {
      for (let round = 0; round < ROUNDS; round++) {
        const email = freshEmail('rev');
        const { token, invitation } = await invite(app, owner, boardId, email);
        const davetli = await createUser(app, 'Davetli', email);

        const [accepted, revoked] = await Promise.all([
          accept(token, davetli),
          revoke(invitation.id),
        ]);

        const memberCount = await prisma.boardMember.count({
          where: { boardId, userId: davetli.user.id },
        });
        const status = (await rowOf(invitation.id)).status;
        if (accepted.status === 200) {
          expect([revoked.status, memberCount, status]).toEqual([409, 1, 'ACCEPTED']);
          expect(revoked.body.code).toBe(ErrorCode.INVITATION_USED);
        } else {
          expect([accepted.status, revoked.status, memberCount, status]).toEqual([
            410,
            204,
            0,
            'REVOKED',
          ]);
          expect(accepted.body.code).toBe(ErrorCode.INVITATION_REVOKED);
        }
      }
    });

    it('ends with one membership when accepting races a re-invite of a now registered address', async () => {
      for (let round = 0; round < ROUNDS; round++) {
        const email = freshEmail('re');
        const { token } = await invite(app, owner, boardId, email);
        const davetli = await createUser(app, 'Davetli', email);

        const [accepted, reinvited] = await Promise.all([
          accept(token, davetli),
          post({ email, role: 'MEMBER' }),
        ]);

        expect(accepted.status).toBe(200);
        expect([201, 409]).toContain(reinvited.status);
        if (reinvited.status === 201) expect(reinvited.body.result).toBe('MEMBER_ADDED');
        else expect(reinvited.body.code).toBe(ErrorCode.ALREADY_MEMBER);
        expect(
          await prisma.boardMember.count({ where: { boardId, userId: davetli.user.id } }),
        ).toBe(1);
      }
    });

    it('kills the old link whichever way accepting it races a re-invite of an unregistered address', async () => {
      // The address is unregistered, so only another account can hold the old link here.
      for (let round = 0; round < ROUNDS; round++) {
        const email = freshEmail('rot');
        const { token: oldToken, invitation } = await invite(app, owner, boardId, email, 'MEMBER');
        const stranger = await createUser(app, 'Yabancı');

        const [accepted, reinvited] = await Promise.all([
          accept(oldToken, stranger),
          post({ email, role: 'ADMIN' }),
        ]);

        // Accepting first meets the wrong email; accepting second meets a replaced token.
        expect([accepted.status, accepted.body.code]).toEqual(
          accepted.status === 403
            ? [403, ErrorCode.EMAIL_MISMATCH]
            : [404, ErrorCode.NOT_FOUND],
        );
        expect(reinvited.status).toBe(201);
        const newToken = tokenOf((reinvited.body as { inviteUrl: string }).inviteUrl);
        expect(await prisma.boardMember.count({ where: { userId: stranger.user.id } })).toBe(0);
        expect((await rowOf(invitation.id)).tokenHash).toBe(hashToken(newToken));
        await previewOf(oldToken).expect(404);

        const rightful = await createUser(app, 'Davetli', email);
        await accept(newToken, rightful).expect(200);
        const member = await prisma.boardMember.findUniqueOrThrow({
          where: { boardId_userId: { boardId, userId: rightful.user.id } },
        });
        expect(member.role).toBe('ADMIN');
      }
    });

    it('leaves no rows behind when accepting races deleting the board', async () => {
      for (let round = 0; round < ROUNDS; round++) {
        const board = await createBoard(app, owner, 'Silinecek');
        const email = freshEmail('del');
        const { token } = await invite(app, owner, board, email);
        const davetli = await createUser(app, 'Davetli', email);

        const [accepted, deleted] = await Promise.all([
          accept(token, davetli),
          http().delete(`/api/v1/boards/${board}`).set('Authorization', owner.auth),
        ]);

        expect([200, 404]).toContain(accepted.status);
        expect(deleted.status).toBe(204);
        expect(await prisma.invitation.count({ where: { boardId: board } })).toBe(0);
        expect(await prisma.boardMember.count({ where: { boardId: board } })).toBe(0);
      }
    });
  });

  describe('cascade', () => {
    it('deletes the invitations with the board', async () => {
      await invite(app, owner, boardId);
      await invite(app, owner, boardId);

      await http()
        .delete(`/api/v1/boards/${boardId}`)
        .set('Authorization', owner.auth)
        .expect(204);

      expect(await prisma.invitation.count()).toBe(0);
    });
  });

  describe('races (5 rounds each)', () => {
    const ROUNDS = 5;

    it('keeps a single row and a single working token for parallel invites of one new address', async () => {
      for (let round = 0; round < ROUNDS; round++) {
        const email = freshEmail('race');
        const admin = await addMember(app, boardId, 'ADMIN');

        const responses = await Promise.all([
          ...Array.from({ length: 3 }, () => post({ email, role: 'MEMBER' })),
          ...Array.from({ length: 2 }, () => post({ email, role: 'MEMBER' }, admin)),
        ]);

        for (const res of responses) expect(res.status).toBe(201);
        const tokens = responses.map((res) =>
          tokenOf((res.body as { inviteUrl: string }).inviteUrl),
        );
        const rows = await prisma.invitation.findMany({ where: { boardId, email } });
        expect(rows).toHaveLength(1);
        const working = tokens.filter((token) => hashToken(token) === rows[0].tokenHash);
        expect(working).toHaveLength(1);
      }
    });

    it('adds a registered address exactly once when invited in parallel', async () => {
      for (let round = 0; round < ROUNDS; round++) {
        const target = await createUser(app, 'Hedef');

        const responses = await Promise.all(
          Array.from({ length: 5 }, () => post({ email: target.user.email, role: 'MEMBER' })),
        );

        const statuses = responses.map((res) => res.status).sort((a, b) => a - b);
        expect(statuses).toEqual([201, 409, 409, 409, 409]);
        const created = responses.find((res) => res.status === 201);
        expect(created?.body.result).toBe('MEMBER_ADDED');
        for (const res of responses.filter((r) => r.status === 409)) {
          expect(res.body.code).toBe(ErrorCode.ALREADY_MEMBER);
        }
        expect(
          await prisma.boardMember.count({ where: { boardId, userId: target.user.id } }),
        ).toBe(1);
      }
    });
  });
});

describe('Invitation rate limit (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    vi.stubEnv('INVITATION_RATE_LIMIT_PER_MINUTE', '3');
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it('limits previews per client with 429 and leaves the login limit alone', async () => {
    const token = 'A'.repeat(43);

    for (let attempt = 0; attempt < 3; attempt++) {
      await http().get(`/api/v1/invitations/${token}`).expect(404);
    }
    const limited = await http().get(`/api/v1/invitations/${token}`).expect(429);

    expect(limited.body.code).toBe(ErrorCode.TOO_MANY_REQUESTS);
    await http()
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong-password' })
      .expect(401);
  });

  it('limits invitation creation per client with 429 and keeps other invitation routes open', async () => {
    const owner = await createUser(app, 'Sahip');
    const boardId = await createBoard(app, owner, 'Sınırlı');
    const send = () =>
      http()
        .post(`/api/v1/boards/${boardId}/invitations`)
        .set('Authorization', owner.auth)
        .send({ email: freshEmail('rl'), role: 'MEMBER' });

    for (let attempt = 0; attempt < 3; attempt++) {
      await send().expect(201);
    }
    const limited = await send().expect(429);

    expect(limited.body.code).toBe(ErrorCode.TOO_MANY_REQUESTS);
    await http()
      .get(`/api/v1/boards/${boardId}/invitations`)
      .set('Authorization', owner.auth)
      .expect(200);
  });

  it('limits accept requests with their own counter', async () => {
    const token = 'B'.repeat(43);

    for (let attempt = 0; attempt < 3; attempt++) {
      await http().post(`/api/v1/invitations/${token}/accept`).expect(401);
    }
    const limited = await http().post(`/api/v1/invitations/${token}/accept`).expect(429);

    expect(limited.body.code).toBe(ErrorCode.TOO_MANY_REQUESTS);
  });
});
