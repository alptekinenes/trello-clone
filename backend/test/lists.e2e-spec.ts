import { INestApplication } from '@nestjs/common';
import { type BoardRole, ErrorCode, type ListDto, POSITION_GAP } from '@trello/contracts';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './utils/create-test-app.js';
import { resetDatabase } from './utils/database.js';
import { createUser, type TestUser } from './utils/users.js';

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('Lists (e2e, database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: TestUser;
  let boardId: string;
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
    const res = await http()
      .post('/api/v1/boards')
      .set('Authorization', owner.auth)
      .send({ title: 'Pano' })
      .expect(201);
    boardId = res.body.id;
  });

  async function addMember(role: BoardRole): Promise<TestUser> {
    const member = await createUser(app, 'Üye');
    await prisma.boardMember.create({ data: { boardId, userId: member.user.id, role } });
    return member;
  }

  async function createList(
    title: string,
    anchors: { afterListId?: string; beforeListId?: string } = {},
    as = owner,
  ): Promise<ListDto> {
    const res = await http()
      .post(`/api/v1/boards/${boardId}/lists`)
      .set('Authorization', as.auth)
      .send({ title, ...anchors })
      .expect(201);
    return res.body as ListDto;
  }

  /** Titles of the active lists in board order, as the board page sees them. */
  async function boardOrder(): Promise<string[]> {
    const res = await http()
      .get(`/api/v1/boards/${boardId}`)
      .set('Authorization', owner.auth)
      .expect(200);
    return (res.body.lists as ListDto[]).map((list) => list.title);
  }

  function move(listId: string, anchors: object, as = owner) {
    return http().post(`/api/v1/lists/${listId}/move`).set('Authorization', as.auth).send(anchors);
  }

  describe('create', () => {
    it('appends lists to the end with spaced positions', async () => {
      const first = await createList('Yapılacaklar');
      const second = await createList('  Yapılıyor  ');

      expect(first).toEqual({
        id: expect.any(String),
        boardId,
        title: 'Yapılacaklar',
        position: POSITION_GAP,
        archivedAt: null,
      });
      expect(second).toMatchObject({ title: 'Yapılıyor', position: 2 * POSITION_GAP });
      expect(await boardOrder()).toEqual(['Yapılacaklar', 'Yapılıyor']);
    });

    it('inserts next to an anchor', async () => {
      const a = await createList('A');
      const c = await createList('C');
      await createList('B', { afterListId: a.id });
      await createList('Önce', { beforeListId: a.id });

      expect(await boardOrder()).toEqual(['Önce', 'A', 'B', 'C']);
      expect(c.position).toBe(2 * POSITION_GAP);
    });

    it('lets any member create lists', async () => {
      const member = await addMember('MEMBER');
      await createList('Üyenin listesi', {}, member);
      expect(await boardOrder()).toEqual(['Üyenin listesi']);
    });

    it('rejects an empty title and a malformed anchor', async () => {
      const res = await http()
        .post(`/api/v1/boards/${boardId}/lists`)
        .set('Authorization', owner.auth)
        .send({ title: ' ', afterListId: 'nope' })
        .expect(400);
      const fields = (res.body.details as { field: string }[]).map((d) => d.field).sort();
      expect(fields).toEqual(['afterListId', 'title']);
    });

    it('returns 409 for an anchor that is not on the board', async () => {
      const res = await http()
        .post(`/api/v1/boards/${boardId}/lists`)
        .set('Authorization', owner.auth)
        .send({ title: 'X', afterListId: MISSING_ID })
        .expect(409);
      expect(res.body.code).toBe(ErrorCode.POSITION_CONFLICT);
    });
  });

  describe('move', () => {
    it('moves a list after, before and to the end', async () => {
      const a = await createList('A');
      const b = await createList('B');
      const c = await createList('C');

      const res = await move(c.id, { afterListId: a.id }).expect(200);
      expect(res.body).toEqual({ id: c.id, position: (a.position + b.position) / 2 });
      expect(await boardOrder()).toEqual(['A', 'C', 'B']);

      await move(b.id, { beforeListId: a.id }).expect(200);
      expect(await boardOrder()).toEqual(['B', 'A', 'C']);

      await move(b.id, {}).expect(200);
      expect(await boardOrder()).toEqual(['A', 'C', 'B']);
    });

    it('returns 409 when the anchor is the list itself or was archived', async () => {
      const a = await createList('A');
      const b = await createList('B');

      await move(a.id, { afterListId: a.id }).expect(409);

      await http()
        .patch(`/api/v1/lists/${b.id}`)
        .set('Authorization', owner.auth)
        .send({ archived: true })
        .expect(200);
      const res = await move(a.id, { afterListId: b.id }).expect(409);
      expect(res.body.code).toBe(ErrorCode.POSITION_CONFLICT);
    });

    it('refuses to move an archived list', async () => {
      const a = await createList('A');
      await prisma.list.update({ where: { id: a.id }, data: { archivedAt: new Date() } });

      const res = await move(a.id, {}).expect(400);
      expect(res.body.code).toBe(ErrorCode.INVALID_TARGET);
    });

    it('rebalances the board when positions get too close, keeping the order', async () => {
      const a = await createList('A');
      const b = await createList('B');
      const c = await createList('C');
      // Simulate many earlier moves into the same gap.
      await prisma.list.update({ where: { id: b.id }, data: { position: a.position + 1e-7 } });

      await move(c.id, { afterListId: a.id }).expect(200);

      expect(await boardOrder()).toEqual(['A', 'C', 'B']);
      const positions = await prisma.list.findMany({
        where: { boardId },
        orderBy: { position: 'asc' },
        select: { position: true },
      });
      expect(positions.map((p) => p.position)).toEqual([1, 2, 3].map((i) => i * POSITION_GAP));
    });

    it('keeps a consistent order under 10 parallel moves', async () => {
      const lists: ListDto[] = [];
      for (const title of ['A', 'B', 'C', 'D', 'E', 'F']) lists.push(await createList(title));
      const [a] = lists;

      // Everyone tries to put a different list right after A at the same time.
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) => {
          const list = lists[1 + (i % 5)];
          return move(list.id, { afterListId: a.id });
        }),
      );

      expect(results.every((res) => res.status === 200)).toBe(true);
      const rows = await prisma.list.findMany({ where: { boardId }, select: { position: true } });
      const positions = rows.map((r) => r.position);
      expect(new Set(positions).size).toBe(6);
      const order = await boardOrder();
      expect(order[0]).toBe('A');
      expect([...order].sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    });
  });

  describe('update', () => {
    it('renames a list', async () => {
      const a = await createList('A');
      const res = await http()
        .patch(`/api/v1/lists/${a.id}`)
        .set('Authorization', owner.auth)
        .send({ title: '  Bitti  ' })
        .expect(200);
      expect(res.body).toMatchObject({ id: a.id, title: 'Bitti', archivedAt: null });
    });

    it('archives a list and restores it to the end', async () => {
      const a = await createList('A');
      await createList('B');

      const archived = await http()
        .patch(`/api/v1/lists/${a.id}`)
        .set('Authorization', owner.auth)
        .send({ archived: true })
        .expect(200);
      expect(archived.body.archivedAt).toEqual(expect.any(String));
      expect(await boardOrder()).toEqual(['B']);

      const archive = await http()
        .get(`/api/v1/boards/${boardId}/lists?archived=true`)
        .set('Authorization', owner.auth)
        .expect(200);
      expect(archive.body.map((l: ListDto) => l.title)).toEqual(['A']);

      const restored = await http()
        .patch(`/api/v1/lists/${a.id}`)
        .set('Authorization', owner.auth)
        .send({ archived: false })
        .expect(200);
      expect(restored.body.archivedAt).toBeNull();
      expect(await boardOrder()).toEqual(['B', 'A']);
    });

    it('rejects a null title and a non-boolean archived flag', async () => {
      const a = await createList('A');
      await http()
        .patch(`/api/v1/lists/${a.id}`)
        .set('Authorization', owner.auth)
        .send({ title: null, archived: 'yes' })
        .expect(400);
    });

    it('lists the active lists without ?archived', async () => {
      await createList('A');
      const res = await http()
        .get(`/api/v1/boards/${boardId}/lists`)
        .set('Authorization', owner.auth)
        .expect(200);
      expect(res.body.map((l: ListDto) => l.title)).toEqual(['A']);
    });
  });

  describe('delete', () => {
    it('is allowed for admins, forbidden for members', async () => {
      const a = await createList('A');
      const member = await addMember('MEMBER');
      const admin = await addMember('ADMIN');

      await http().delete(`/api/v1/lists/${a.id}`).set('Authorization', member.auth).expect(403);
      await http().delete(`/api/v1/lists/${a.id}`).set('Authorization', admin.auth).expect(204);

      expect(await boardOrder()).toEqual([]);
      await http().delete(`/api/v1/lists/${a.id}`).set('Authorization', owner.auth).expect(404);
    });
  });

  describe('access', () => {
    it('hides lists of other boards behind 404', async () => {
      const a = await createList('A');
      const stranger = await createUser(app, 'Yabancı');
      const as = (req: request.Test) => req.set('Authorization', stranger.auth).expect(404);

      const res = await as(http().patch(`/api/v1/lists/${a.id}`).send({ title: 'X' }));
      expect(res.body.message).toBe('List not found');
      await as(move(a.id, {}, stranger));
      await as(http().delete(`/api/v1/lists/${a.id}`));
      await as(http().get(`/api/v1/boards/${boardId}/lists`));
      await as(http().post(`/api/v1/boards/${boardId}/lists`).send({ title: 'X' }));

      // A missing or malformed list id looks the same.
      await http().patch(`/api/v1/lists/${MISSING_ID}`).set('Authorization', owner.auth).send({}).expect(404);
      await http().patch('/api/v1/lists/nope').set('Authorization', owner.auth).send({}).expect(404);
    });
  });
});
