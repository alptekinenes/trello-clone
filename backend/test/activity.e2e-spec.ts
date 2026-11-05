import { INestApplication } from '@nestjs/common';
import {
  type ActivityDto,
  type ActivityType,
  type CardFeedPageDto,
  type CardSummaryDto,
  type ListDto,
} from '@trello/contracts';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { addMember, createBoard, createCard, createList } from './utils/board-fixtures.js';
import { createTestApp } from './utils/create-test-app.js';
import { resetDatabase } from './utils/database.js';
import { createUser, type TestUser } from './utils/users.js';

describe('Card activity (e2e, database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: TestUser;
  let member: TestUser;
  let boardId: string;
  let todo: ListDto;
  let done: ListDto;
  let card: CardSummaryDto;
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
    boardId = await createBoard(app, owner);
    member = await addMember(app, boardId, 'MEMBER', 'Üye');
    todo = await createList(app, owner, boardId, 'Yapılacaklar');
    done = await createList(app, owner, boardId, 'Bitti');
    card = await createCard(app, owner, todo.id, 'Rapor');
  });

  const patch = (body: object, as = owner) =>
    http().patch(`/api/v1/cards/${card.id}`).set('Authorization', as.auth).send(body);
  const move = (body: object, as = owner) =>
    http().post(`/api/v1/cards/${card.id}/move`).set('Authorization', as.auth).send(body);

  /** Entries of the card oldest first, with the order of one request kept (id breaks no ties here). */
  async function log(): Promise<{ type: ActivityType; data: unknown; actorId: string }[]> {
    const rows = await prisma.activity.findMany({
      where: { cardId: card.id },
      orderBy: [{ createdAt: 'asc' }],
      select: { type: true, data: true, actorId: true },
    });
    return rows;
  }
  const types = async () => (await log()).map((entry) => entry.type);

  describe('entries', () => {
    it('records CARD_CREATED with the card title and the list name', async () => {
      expect(await log()).toEqual([
        {
          type: 'CARD_CREATED',
          actorId: owner.user.id,
          data: { cardTitle: 'Rapor', list: { id: todo.id, title: 'Yapılacaklar' } },
        },
      ]);
    });

    it('records CARD_MOVED with both list names when the card changes list', async () => {
      await move({ listId: done.id }).expect(200);

      const entries = await log();
      expect(entries.at(-1)).toEqual({
        type: 'CARD_MOVED',
        actorId: owner.user.id,
        data: {
          cardTitle: 'Rapor',
          fromList: { id: todo.id, title: 'Yapılacaklar' },
          toList: { id: done.id, title: 'Bitti' },
        },
      });
    });

    it('records nothing when the order changes inside one list', async () => {
      const other = await createCard(app, owner, todo.id, 'Öteki');
      const before = await prisma.activity.count();

      await move({ listId: todo.id, afterCardId: other.id }).expect(200);

      expect(await prisma.activity.count()).toBe(before);
    });

    it('records archive, restore, complete and uncomplete, one entry each', async () => {
      await patch({ archived: true }).expect(200);
      await patch({ archived: false }).expect(200);
      await patch({ isCompleted: true }).expect(200);
      await patch({ isCompleted: false }).expect(200);

      expect(await types()).toEqual([
        'CARD_CREATED',
        'CARD_ARCHIVED',
        'CARD_RESTORED',
        'CARD_COMPLETED',
        'CARD_UNCOMPLETED',
      ]);
      expect((await log()).at(-1)?.data).toEqual({ cardTitle: 'Rapor' });
    });

    it('records two entries when one request changes both states', async () => {
      await patch({ archived: true }).expect(200);

      await patch({ archived: false, isCompleted: true }).expect(200);

      const last = (await types()).slice(-2);
      expect([...last].sort()).toEqual(['CARD_COMPLETED', 'CARD_RESTORED']);
    });

    it('records nothing when the request asks for the state the card is already in', async () => {
      await patch({ isCompleted: true }).expect(200);
      await patch({ archived: true }).expect(200);
      const count = await prisma.activity.count();

      await patch({ isCompleted: true }).expect(200);
      await patch({ archived: true }).expect(200);
      await patch({ isCompleted: false }).expect(200);
      await patch({ archived: false }).expect(200);
      await patch({ archived: false }).expect(200);
      await patch({ isCompleted: false }).expect(200);

      // Only the two real changes (uncomplete, restore) are added.
      expect(await prisma.activity.count()).toBe(count + 2);
    });

    it('records nothing for edits that are not state changes', async () => {
      const count = await prisma.activity.count();

      await patch({ title: 'Yeni ad', description: 'Metin', dueDate: '2026-12-01T09:00:00.000Z' }).expect(200);
      await patch({ coverColor: 'BLUE' }).expect(200);

      expect(await prisma.activity.count()).toBe(count);
    });

    it('records one entry for two simultaneous completions', async () => {
      const results = await Promise.all([
        patch({ isCompleted: true }),
        patch({ isCompleted: true }, member),
        patch({ isCompleted: true }),
      ]);

      expect(results.map((res) => res.status)).toEqual([200, 200, 200]);
      expect((await types()).filter((type) => type === 'CARD_COMPLETED')).toHaveLength(1);
    });

    it('records one entry for two simultaneous archives', async () => {
      await Promise.all([patch({ archived: true }), patch({ archived: true })]);

      expect((await types()).filter((type) => type === 'CARD_ARCHIVED')).toHaveLength(1);
    });

    it('records member additions and removals once, with the member name', async () => {
      const put = () =>
        http().put(`/api/v1/cards/${card.id}/members/${member.user.id}`).set('Authorization', owner.auth);
      const del = () =>
        http().delete(`/api/v1/cards/${card.id}/members/${member.user.id}`).set('Authorization', owner.auth);

      await put().expect(204);
      await put().expect(204);
      await del().expect(204);
      await del().expect(204);

      const entries = (await log()).slice(1);
      expect(entries).toEqual([
        {
          type: 'CARD_MEMBER_ADDED',
          actorId: owner.user.id,
          data: { cardTitle: 'Rapor', member: { id: member.user.id, name: 'Üye' } },
        },
        {
          type: 'CARD_MEMBER_REMOVED',
          actorId: owner.user.id,
          data: { cardTitle: 'Rapor', member: { id: member.user.id, name: 'Üye' } },
        },
      ]);
    });

    it('records the member who joined the card themselves as both actor and member', async () => {
      await http()
        .put(`/api/v1/cards/${card.id}/members/${member.user.id}`)
        .set('Authorization', member.auth)
        .expect(204);

      const [, added] = await log();
      expect(added).toMatchObject({ actorId: member.user.id });
      expect(added.data).toMatchObject({ member: { id: member.user.id } });
    });

    it('records nothing for a member who is not on the board', async () => {
      const stranger = await createUser(app, 'Yabancı');
      const count = await prisma.activity.count();

      await http()
        .put(`/api/v1/cards/${card.id}/members/${stranger.user.id}`)
        .set('Authorization', owner.auth)
        .expect(400);

      expect(await prisma.activity.count()).toBe(count);
    });
  });

  describe('copies', () => {
    it('keeps the old names after the list and the card are renamed', async () => {
      await http()
        .patch(`/api/v1/lists/${todo.id}`)
        .set('Authorization', owner.auth)
        .send({ title: 'Yeni liste adı' })
        .expect(200);
      await patch({ title: 'Yeni kart adı' }).expect(200);

      const [created] = await log();
      expect(created.data).toEqual({
        cardTitle: 'Rapor',
        list: { id: todo.id, title: 'Yapılacaklar' },
      });

      await patch({ isCompleted: true }).expect(200);
      expect((await log()).at(-1)?.data).toEqual({ cardTitle: 'Yeni kart adı' });
    });

    it('keeps the member name as it was when the member joined', async () => {
      await http()
        .put(`/api/v1/cards/${card.id}/members/${member.user.id}`)
        .set('Authorization', owner.auth)
        .expect(204);
      await prisma.user.update({ where: { id: member.user.id }, data: { name: 'Yeni Ad' } });

      const entry = (await log()).at(-1);
      expect(entry?.data).toMatchObject({ member: { name: 'Üye' } });
    });
  });

  describe('feed', () => {
    it('shows entries with details=true, newest first, with the actor and no e-mail', async () => {
      await patch({ archived: true }).expect(200);

      const res = await http()
        .get(`/api/v1/cards/${card.id}/feed?details=true`)
        .set('Authorization', member.auth)
        .expect(200);

      const page = res.body as CardFeedPageDto;
      expect(page.items.map((item) => (item.kind === 'activity' ? item.type : item.kind))).toEqual([
        'CARD_ARCHIVED',
        'CARD_CREATED',
      ]);
      const first = page.items[0] as ActivityDto;
      expect(first.actor).toEqual({ id: owner.user.id, name: 'Sahip', avatarUrl: null });
      expect(first.data).toEqual({ cardTitle: 'Rapor' });
      expect(JSON.stringify(res.body)).not.toContain(owner.user.email);
    });

    it('hides entries by default', async () => {
      await patch({ archived: true }).expect(200);

      const res = await http()
        .get(`/api/v1/cards/${card.id}/feed`)
        .set('Authorization', owner.auth)
        .expect(200);

      expect(res.body).toEqual({ items: [], nextCursor: null });
    });

    it('mixes comments and entries by time across pages', async () => {
      await patch({ archived: true }).expect(200);
      await http()
        .post(`/api/v1/cards/${card.id}/comments`)
        .set('Authorization', owner.auth)
        .send({ body: 'Not' })
        .expect(201);
      await patch({ archived: false }).expect(200);

      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const res = await http()
          .get(`/api/v1/cards/${card.id}/feed?details=true&limit=2${cursor ? `&cursor=${cursor}` : ''}`)
          .set('Authorization', owner.auth)
          .expect(200);
        const page = res.body as CardFeedPageDto;
        seen.push(...page.items.map((item) => (item.kind === 'activity' ? item.type : 'COMMENT')));
        cursor = page.nextCursor;
      } while (cursor);

      expect(seen).toEqual(['CARD_RESTORED', 'COMMENT', 'CARD_ARCHIVED', 'CARD_CREATED']);
    });
  });

  describe('lifetime', () => {
    it('deletes the entries with the card', async () => {
      await patch({ isCompleted: true }).expect(200);

      await http().delete(`/api/v1/cards/${card.id}`).set('Authorization', owner.auth).expect(204);

      expect(await prisma.activity.count()).toBe(0);
    });

    it('keeps the entries when the card is archived', async () => {
      await patch({ archived: true }).expect(200);

      expect(await prisma.activity.count({ where: { cardId: card.id } })).toBe(2);
    });
  });
});
