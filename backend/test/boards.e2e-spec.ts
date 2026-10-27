import { INestApplication } from '@nestjs/common';
import { type BoardRole, ErrorCode } from '@trello/contracts';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './utils/create-test-app.js';
import { resetDatabase } from './utils/database.js';
import { createUser, type TestUser } from './utils/users.js';

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('Boards and members (e2e, database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: TestUser;
  let stranger: TestUser;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    owner = await createUser(app, 'Sahip');
    stranger = await createUser(app, 'Yabancı');
  });

  async function createBoard(title = 'Proje', background?: string): Promise<string> {
    const res = await http()
      .post('/api/v1/boards')
      .set('Authorization', owner.auth)
      .send({ title, background })
      .expect(201);
    return res.body.id as string;
  }

  /** Adds a member directly; invitations arrive in a later phase. */
  async function addMember(boardId: string, role: BoardRole, name = 'Üye'): Promise<TestUser> {
    const member = await createUser(app, name);
    await prisma.boardMember.create({ data: { boardId, userId: member.user.id, role } });
    return member;
  }

  describe('board CRUD', () => {
    it('creates a board with the owner membership and six default labels', async () => {
      const res = await http()
        .post('/api/v1/boards')
        .set('Authorization', owner.auth)
        .send({ title: '  Yol haritası  ', background: 'green' })
        .expect(201);

      expect(res.body).toEqual({
        id: expect.any(String),
        title: 'Yol haritası',
        background: 'green',
        myRole: 'OWNER',
        updatedAt: expect.any(String),
      });

      const detail = await http()
        .get(`/api/v1/boards/${res.body.id}`)
        .set('Authorization', owner.auth)
        .expect(200);

      expect(detail.body.board).toEqual(res.body);
      expect(detail.body.members).toEqual([
        {
          userId: owner.user.id,
          name: 'Sahip',
          email: owner.user.email,
          avatarUrl: null,
          role: 'OWNER',
          joinedAt: expect.any(String),
        },
      ]);
      expect(detail.body.labels.map((l: { color: string }) => l.color)).toEqual([
        'GREEN',
        'YELLOW',
        'ORANGE',
        'RED',
        'PURPLE',
        'BLUE',
      ]);
    });

    it('defaults the background to blue', async () => {
      const id = await createBoard('Varsayılan');
      const res = await http().get(`/api/v1/boards/${id}`).set('Authorization', owner.auth);
      expect(res.body.board.background).toBe('blue');
    });

    it('rejects an empty title, an unknown background and extra fields', async () => {
      const res = await http()
        .post('/api/v1/boards')
        .set('Authorization', owner.auth)
        .send({ title: '   ', background: '#ff0000', ownerId: stranger.user.id })
        .expect(400);

      const fields = (res.body.details as { field: string }[]).map((d) => d.field).sort();
      expect(fields).toEqual(['background', 'ownerId', 'title']);
    });

    it('lists only the boards the user is a member of, with their role', async () => {
      const mine = await createBoard('Benim');
      const shared = await createBoard('Paylaşılan');
      const member = await addMember(shared, 'MEMBER');

      const ownerList = await http().get('/api/v1/boards').set('Authorization', owner.auth);
      expect(ownerList.body.map((b: { id: string }) => b.id).sort()).toEqual([mine, shared].sort());

      const memberList = await http().get('/api/v1/boards').set('Authorization', member.auth);
      expect(memberList.body).toEqual([expect.objectContaining({ id: shared, myRole: 'MEMBER' })]);

      const strangerList = await http().get('/api/v1/boards').set('Authorization', stranger.auth);
      expect(strangerList.body).toEqual([]);
    });

    it('requires authentication', async () => {
      await http().get('/api/v1/boards').expect(401);
      await http().post('/api/v1/boards').send({ title: 'X' }).expect(401);
    });

    it('lets an admin rename and recolor the board', async () => {
      const id = await createBoard();
      const admin = await addMember(id, 'ADMIN');

      const res = await http()
        .patch(`/api/v1/boards/${id}`)
        .set('Authorization', admin.auth)
        .send({ title: 'Yeni ad', background: 'purple' })
        .expect(200);

      expect(res.body).toMatchObject({ id, title: 'Yeni ad', background: 'purple', myRole: 'ADMIN' });
    });

    it('rejects null fields on update', async () => {
      const id = await createBoard();
      await http()
        .patch(`/api/v1/boards/${id}`)
        .set('Authorization', owner.auth)
        .send({ title: null })
        .expect(400);
    });

    it('forbids a member from updating the board (403)', async () => {
      const id = await createBoard();
      const member = await addMember(id, 'MEMBER');

      const res = await http()
        .patch(`/api/v1/boards/${id}`)
        .set('Authorization', member.auth)
        .send({ title: 'Ele geçirildi' })
        .expect(403);
      expect(res.body.code).toBe(ErrorCode.FORBIDDEN);
    });

    it('lets only the owner delete the board, and deletion cascades', async () => {
      const id = await createBoard();
      const admin = await addMember(id, 'ADMIN');

      await http().delete(`/api/v1/boards/${id}`).set('Authorization', admin.auth).expect(403);
      await http().delete(`/api/v1/boards/${id}`).set('Authorization', owner.auth).expect(204);

      await http().get(`/api/v1/boards/${id}`).set('Authorization', owner.auth).expect(404);
      expect(await prisma.label.count({ where: { boardId: id } })).toBe(0);
      expect(await prisma.boardMember.count({ where: { boardId: id } })).toBe(0);
    });
  });

  describe('non-members', () => {
    it('get 404 for every board route, the same as for a missing board', async () => {
      const id = await createBoard();
      const as = (req: request.Test) => req.set('Authorization', stranger.auth).expect(404);

      for (const boardId of [id, MISSING_ID]) {
        const res = await as(http().get(`/api/v1/boards/${boardId}`));
        expect(res.body).toMatchObject({ code: ErrorCode.NOT_FOUND, message: 'Board not found' });
        await as(http().patch(`/api/v1/boards/${boardId}`).send({ title: 'X' }));
        await as(http().delete(`/api/v1/boards/${boardId}`));
        await as(http().get(`/api/v1/boards/${boardId}/members`));
      }
    });

    it('get 404 for a malformed board id instead of a server error', async () => {
      await http().get('/api/v1/boards/not-a-uuid').set('Authorization', owner.auth).expect(404);
    });
  });

  describe('members', () => {
    it('lists members with the owner first', async () => {
      const id = await createBoard();
      const member = await addMember(id, 'MEMBER', 'Üye');
      const admin = await addMember(id, 'ADMIN', 'Yönetici');

      const res = await http()
        .get(`/api/v1/boards/${id}/members`)
        .set('Authorization', member.auth)
        .expect(200);

      expect(res.body.map((m: { userId: string; role: string }) => [m.userId, m.role])).toEqual([
        [owner.user.id, 'OWNER'],
        [admin.user.id, 'ADMIN'],
        [member.user.id, 'MEMBER'],
      ]);
    });

    it('lets the owner change roles, but never the owner role', async () => {
      const id = await createBoard();
      const member = await addMember(id, 'MEMBER');

      const res = await http()
        .patch(`/api/v1/boards/${id}/members/${member.user.id}`)
        .set('Authorization', owner.auth)
        .send({ role: 'ADMIN' })
        .expect(200);
      expect(res.body).toMatchObject({ userId: member.user.id, role: 'ADMIN' });

      const self = await http()
        .patch(`/api/v1/boards/${id}/members/${owner.user.id}`)
        .set('Authorization', owner.auth)
        .send({ role: 'MEMBER' })
        .expect(400);
      expect(self.body.code).toBe(ErrorCode.CANNOT_CHANGE_OWNER);

      await http()
        .patch(`/api/v1/boards/${id}/members/${member.user.id}`)
        .set('Authorization', owner.auth)
        .send({ role: 'OWNER' })
        .expect(400);
    });

    it('forbids an admin from changing roles', async () => {
      const id = await createBoard();
      const admin = await addMember(id, 'ADMIN');
      const member = await addMember(id, 'MEMBER');

      await http()
        .patch(`/api/v1/boards/${id}/members/${member.user.id}`)
        .set('Authorization', admin.auth)
        .send({ role: 'ADMIN' })
        .expect(403);
    });

    it('returns 404 for a user who is not a member and 400 for a malformed user id', async () => {
      const id = await createBoard();

      await http()
        .patch(`/api/v1/boards/${id}/members/${stranger.user.id}`)
        .set('Authorization', owner.auth)
        .send({ role: 'ADMIN' })
        .expect(404);
      await http()
        .delete(`/api/v1/boards/${id}/members/not-a-uuid`)
        .set('Authorization', owner.auth)
        .expect(400);
    });

    it('lets an admin remove a member but not another admin', async () => {
      const id = await createBoard();
      const admin = await addMember(id, 'ADMIN');
      const otherAdmin = await addMember(id, 'ADMIN');
      const member = await addMember(id, 'MEMBER');

      await http()
        .delete(`/api/v1/boards/${id}/members/${member.user.id}`)
        .set('Authorization', admin.auth)
        .expect(204);
      await http()
        .delete(`/api/v1/boards/${id}/members/${otherAdmin.user.id}`)
        .set('Authorization', admin.auth)
        .expect(403);
      await http()
        .delete(`/api/v1/boards/${id}/members/${otherAdmin.user.id}`)
        .set('Authorization', owner.auth)
        .expect(204);

      // A removed member loses access immediately.
      await http().get(`/api/v1/boards/${id}`).set('Authorization', member.auth).expect(404);
    });

    it('forbids a member from removing someone else', async () => {
      const id = await createBoard();
      const member = await addMember(id, 'MEMBER');
      const other = await addMember(id, 'MEMBER');

      await http()
        .delete(`/api/v1/boards/${id}/members/${other.user.id}`)
        .set('Authorization', member.auth)
        .expect(403);
    });

    it('lets a member leave, but not the owner', async () => {
      const id = await createBoard();
      const member = await addMember(id, 'MEMBER');

      await http()
        .delete(`/api/v1/boards/${id}/members/${member.user.id}`)
        .set('Authorization', member.auth)
        .expect(204);

      const res = await http()
        .delete(`/api/v1/boards/${id}/members/${owner.user.id}`)
        .set('Authorization', owner.auth)
        .expect(400);
      expect(res.body.code).toBe(ErrorCode.OWNER_CANNOT_LEAVE);
    });

    it('never lets anyone remove the owner', async () => {
      const id = await createBoard();
      const admin = await addMember(id, 'ADMIN');

      await http()
        .delete(`/api/v1/boards/${id}/members/${owner.user.id}`)
        .set('Authorization', admin.auth)
        .expect(403);
    });
  });
});
