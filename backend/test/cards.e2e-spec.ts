import { INestApplication } from '@nestjs/common';
import {
  type BoardDetailDto,
  type CardSummaryDto,
  ErrorCode,
  type ListDto,
  POSITION_GAP,
} from '@trello/contracts';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './utils/create-test-app.js';
import { resetDatabase } from './utils/database.js';
import { createUser, type TestUser } from './utils/users.js';

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

interface Anchors {
  afterCardId?: string | null;
  beforeCardId?: string | null;
}

describe('Cards (e2e, database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: TestUser;
  let boardId: string;
  let todo: ListDto;
  let done: ListDto;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function createBoard(as: TestUser, title = 'Pano'): Promise<string> {
    const res = await http()
      .post('/api/v1/boards')
      .set('Authorization', as.auth)
      .send({ title })
      .expect(201);
    return res.body.id as string;
  }

  async function createList(title: string, board = boardId, as = owner): Promise<ListDto> {
    const res = await http()
      .post(`/api/v1/boards/${board}/lists`)
      .set('Authorization', as.auth)
      .send({ title })
      .expect(201);
    return res.body as ListDto;
  }

  async function createCard(
    listId: string,
    title: string,
    anchors: Anchors = {},
    as = owner,
  ): Promise<CardSummaryDto> {
    const res = await http()
      .post(`/api/v1/lists/${listId}/cards`)
      .set('Authorization', as.auth)
      .send({ title, ...anchors })
      .expect(201);
    return res.body as CardSummaryDto;
  }

  async function boardDetail(): Promise<BoardDetailDto> {
    const res = await http()
      .get(`/api/v1/boards/${boardId}`)
      .set('Authorization', owner.auth)
      .expect(200);
    return res.body as BoardDetailDto;
  }

  /** Card titles per list title, in board order, as the board page sees them. */
  async function columns(): Promise<Record<string, string[]>> {
    const detail = await boardDetail();
    return Object.fromEntries(
      detail.lists.map((list) => [
        list.title,
        detail.cards.filter((card) => card.listId === list.id).map((card) => card.title),
      ]),
    );
  }

  function move(cardId: string, body: object, as = owner) {
    return http().post(`/api/v1/cards/${cardId}/move`).set('Authorization', as.auth).send(body);
  }

  function patch(cardId: string, body: object, as = owner) {
    return http().patch(`/api/v1/cards/${cardId}`).set('Authorization', as.auth).send(body);
  }

  beforeEach(async () => {
    await resetDatabase(app);
    owner = await createUser(app, 'Sahip');
    boardId = await createBoard(owner);
    todo = await createList('Yapılacaklar');
    done = await createList('Bitti');
  });

  describe('create', () => {
    it('appends cards to the end of the list with spaced positions', async () => {
      const first = await createCard(todo.id, '  Taslak hazırla  ');
      const second = await createCard(todo.id, 'Gözden geçir');

      expect(first).toEqual({
        id: expect.any(String),
        listId: todo.id,
        title: 'Taslak hazırla',
        position: POSITION_GAP,
        dueDate: null,
        dueComplete: false,
        archivedAt: null,
        labelIds: [],
        hasDescription: false,
        checklistTotal: 0,
        checklistDone: 0,
        commentCount: 0,
        completedAt: null,
        coverColor: null,
        memberIds: [],
      });
      expect(second.position).toBe(2 * POSITION_GAP);
      expect(await columns()).toEqual({
        Yapılacaklar: ['Taslak hazırla', 'Gözden geçir'],
        Bitti: [],
      });
    });

    it('inserts next to an anchor', async () => {
      const a = await createCard(todo.id, 'A');
      await createCard(todo.id, 'C');
      await createCard(todo.id, 'B', { afterCardId: a.id });
      await createCard(todo.id, 'Önce', { beforeCardId: a.id });

      expect((await columns()).Yapılacaklar).toEqual(['Önce', 'A', 'B', 'C']);
    });

    it('lets any member add cards', async () => {
      const member = await createUser(app, 'Üye');
      await prisma.boardMember.create({
        data: { boardId, userId: member.user.id, role: 'MEMBER' },
      });

      await createCard(todo.id, 'Üyenin kartı', {}, member);

      expect((await columns()).Yapılacaklar).toEqual(['Üyenin kartı']);
    });

    it('rejects an empty title and a malformed anchor', async () => {
      const res = await http()
        .post(`/api/v1/lists/${todo.id}/cards`)
        .set('Authorization', owner.auth)
        .send({ title: '  ', beforeCardId: 'nope' })
        .expect(400);
      const fields = (res.body.details as { field: string }[]).map((d) => d.field).sort();
      expect(fields).toEqual(['beforeCardId', 'title']);
    });

    it('refuses an archived list with 400 INVALID_TARGET', async () => {
      await prisma.list.update({ where: { id: todo.id }, data: { archivedAt: new Date() } });

      const res = await http()
        .post(`/api/v1/lists/${todo.id}/cards`)
        .set('Authorization', owner.auth)
        .send({ title: 'X' })
        .expect(400);
      expect(res.body.code).toBe(ErrorCode.INVALID_TARGET);
    });

    it('returns 409 for an anchor that is in another list', async () => {
      const elsewhere = await createCard(done.id, 'Başka listede');

      const res = await http()
        .post(`/api/v1/lists/${todo.id}/cards`)
        .set('Authorization', owner.auth)
        .send({ title: 'X', afterCardId: elsewhere.id })
        .expect(409);
      expect(res.body.code).toBe(ErrorCode.POSITION_CONFLICT);
    });
  });

  describe('board detail', () => {
    it('includes active cards of active lists only', async () => {
      const kept = await createCard(todo.id, 'Kalan');
      const archived = await createCard(todo.id, 'Arşivlenen');
      await createCard(done.id, 'Arşivdeki listede');
      await patch(archived.id, { archived: true }).expect(200);
      await http()
        .patch(`/api/v1/lists/${done.id}`)
        .set('Authorization', owner.auth)
        .send({ archived: true })
        .expect(200);

      const detail = await boardDetail();

      expect(detail.cards.map((card) => card.id)).toEqual([kept.id]);
    });
  });

  describe('move', () => {
    it('reorders cards inside a list', async () => {
      const a = await createCard(todo.id, 'A');
      const b = await createCard(todo.id, 'B');
      const c = await createCard(todo.id, 'C');

      const res = await move(c.id, { listId: todo.id, afterCardId: a.id }).expect(200);
      expect(res.body).toEqual({
        id: c.id,
        listId: todo.id,
        position: (a.position + b.position) / 2,
        rebalanced: null,
      });
      expect((await columns()).Yapılacaklar).toEqual(['A', 'C', 'B']);

      await move(b.id, { listId: todo.id, beforeCardId: a.id }).expect(200);
      expect((await columns()).Yapılacaklar).toEqual(['B', 'A', 'C']);

      await move(b.id, { listId: todo.id }).expect(200);
      expect((await columns()).Yapılacaklar).toEqual(['A', 'C', 'B']);
    });

    it('moves cards to another list, including an empty one', async () => {
      const a = await createCard(todo.id, 'A');
      const b = await createCard(todo.id, 'B');

      await move(a.id, { listId: done.id }).expect(200);
      expect(await columns()).toEqual({ Yapılacaklar: ['B'], Bitti: ['A'] });

      const res = await move(b.id, { listId: done.id, beforeCardId: a.id }).expect(200);
      expect(res.body).toEqual({
        id: b.id,
        listId: done.id,
        position: POSITION_GAP / 2,
        rebalanced: null,
      });
      expect(await columns()).toEqual({ Yapılacaklar: [], Bitti: ['B', 'A'] });
    });

    it('refuses a list of another board with 400 INVALID_TARGET', async () => {
      const a = await createCard(todo.id, 'A');
      const otherBoard = await createBoard(owner, 'Başka pano');
      const foreign = await createList('Yabancı', otherBoard);

      const res = await move(a.id, { listId: foreign.id }).expect(400);
      expect(res.body.code).toBe(ErrorCode.INVALID_TARGET);

      await move(a.id, { listId: MISSING_ID }).expect(400);
      expect((await columns()).Yapılacaklar).toEqual(['A']);
    });

    it('refuses an archived target list and an archived card', async () => {
      const a = await createCard(todo.id, 'A');
      const b = await createCard(todo.id, 'B');
      await prisma.list.update({ where: { id: done.id }, data: { archivedAt: new Date() } });
      await patch(b.id, { archived: true }).expect(200);

      const toArchivedList = await move(a.id, { listId: done.id }).expect(400);
      expect(toArchivedList.body.code).toBe(ErrorCode.INVALID_TARGET);
      const archivedCard = await move(b.id, { listId: todo.id }).expect(400);
      expect(archivedCard.body.code).toBe(ErrorCode.INVALID_TARGET);
    });

    it('returns 409 when the anchor was deleted, archived or is in another list', async () => {
      const a = await createCard(todo.id, 'A');
      const b = await createCard(todo.id, 'B');
      const c = await createCard(todo.id, 'C');
      const other = await createCard(done.id, 'Diğer');

      await http().delete(`/api/v1/cards/${b.id}`).set('Authorization', owner.auth).expect(204);
      const deleted = await move(a.id, { listId: todo.id, afterCardId: b.id }).expect(409);
      expect(deleted.body.code).toBe(ErrorCode.POSITION_CONFLICT);

      await patch(c.id, { archived: true }).expect(200);
      await move(a.id, { listId: todo.id, beforeCardId: c.id }).expect(409);
      await move(a.id, { listId: todo.id, afterCardId: other.id }).expect(409);
      await move(a.id, { listId: todo.id, afterCardId: a.id }).expect(409);
    });

    it('validates the body', async () => {
      const a = await createCard(todo.id, 'A');
      const res = await move(a.id, { listId: 'nope', position: 3 }).expect(400);
      const fields = (res.body.details as { field: string }[]).map((d) => d.field).sort();
      expect(fields).toEqual(['listId', 'position']);
    });

    it('rebalances the list when positions get too close, keeping the order', async () => {
      const a = await createCard(done.id, 'A');
      const b = await createCard(done.id, 'B');
      const c = await createCard(todo.id, 'C');
      // Simulate many earlier moves into the same gap.
      await prisma.card.update({ where: { id: b.id }, data: { position: a.position + 1e-7 } });

      const res = await move(c.id, { listId: done.id, afterCardId: a.id }).expect(200);

      expect((await columns()).Bitti).toEqual(['A', 'C', 'B']);
      const rows = await prisma.card.findMany({
        where: { listId: done.id },
        orderBy: { position: 'asc' },
        select: { id: true, position: true },
      });
      expect(rows.map((r) => r.position)).toEqual([1, 2, 3].map((i) => i * POSITION_GAP));
      // The response carries the new positions of the other cards, as stored.
      const stored = new Map(rows.map((r) => [r.id, r.position]));
      expect(res.body.position).toBe(stored.get(c.id));
      expect(res.body.rebalanced).toEqual({
        entity: 'card',
        listId: done.id,
        positions: [
          { id: a.id, position: stored.get(a.id) },
          { id: b.id, position: stored.get(b.id) },
        ],
      });
    });

    it('keeps both lists consistent under 20 parallel moves', async () => {
      const cards: CardSummaryDto[] = [];
      for (const title of ['A', 'B', 'C', 'D']) cards.push(await createCard(todo.id, title));
      for (const title of ['E', 'F', 'G', 'H']) cards.push(await createCard(done.id, title));
      const [a] = cards;
      const e = cards[4];

      // Cards criss-cross between the two lists at the same time.
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) => {
          const card = cards[1 + (i % 7)];
          const toDone = i % 2 === 0;
          if (card.id === e.id) return move(card.id, { listId: todo.id, afterCardId: a.id });
          return move(
            card.id,
            toDone
              ? { listId: done.id, beforeCardId: e.id }
              : { listId: todo.id, afterCardId: a.id },
          );
        }),
      );

      // A move may lose a race for its anchor (409); none may fail otherwise.
      expect(results.every((res) => res.status === 200 || res.status === 409)).toBe(true);
      const rows = await prisma.card.findMany({ select: { listId: true, position: true } });
      expect(rows).toHaveLength(8);
      for (const listId of [todo.id, done.id]) {
        const positions = rows.filter((r) => r.listId === listId).map((r) => r.position);
        expect(new Set(positions).size).toBe(positions.length);
      }
      const after = await columns();
      expect([...after.Yapılacaklar, ...after.Bitti].sort()).toEqual([
        'A',
        'B',
        'C',
        'D',
        'E',
        'F',
        'G',
        'H',
      ]);
    });
  });

  describe('concurrency with list writes', () => {
    it('adds cards while the same list is renamed and other lists move, without deadlocks', async () => {
      const others = [await createList('C'), await createList('D')];

      // Card inserts check the board row (FK) while list writes lock it.
      const results = await Promise.all(
        Array.from({ length: 30 }, (_, i) => {
          if (i % 3 === 0) {
            return http()
              .post(`/api/v1/lists/${todo.id}/cards`)
              .set('Authorization', owner.auth)
              .send({ title: `Kart ${i}` });
          }
          if (i % 3 === 1) {
            return http()
              .patch(`/api/v1/lists/${todo.id}`)
              .set('Authorization', owner.auth)
              .send({ title: `Yapılacaklar ${i}` });
          }
          return http()
            .post(`/api/v1/lists/${others[i % 2].id}/move`)
            .set('Authorization', owner.auth)
            .send({ afterListId: todo.id });
        }),
      );

      expect(results.filter((res) => res.status >= 300).map((res) => res.body)).toEqual([]);
      expect(await prisma.card.count({ where: { listId: todo.id } })).toBe(10);
    });
  });

  describe('update', () => {
    it('renames a card', async () => {
      const a = await createCard(todo.id, 'A');
      const res = await patch(a.id, { title: '  Yeni ad  ' }).expect(200);
      expect(res.body).toMatchObject({ id: a.id, title: 'Yeni ad', archivedAt: null });
    });

    it('archives a card and restores it to the end of its list', async () => {
      const a = await createCard(todo.id, 'A');
      await createCard(todo.id, 'B');

      const archived = await patch(a.id, { archived: true }).expect(200);
      expect(archived.body.archivedAt).toEqual(expect.any(String));
      expect((await columns()).Yapılacaklar).toEqual(['B']);

      const archive = await http()
        .get(`/api/v1/boards/${boardId}/cards?archived=true`)
        .set('Authorization', owner.auth)
        .expect(200);
      expect(archive.body.map((c: CardSummaryDto) => c.title)).toEqual(['A']);

      const restored = await patch(a.id, { archived: false }).expect(200);
      expect(restored.body).toMatchObject({ archivedAt: null, position: 3 * POSITION_GAP });
      expect((await columns()).Yapılacaklar).toEqual(['B', 'A']);
    });

    it('refuses to restore a card while its list is archived', async () => {
      const a = await createCard(todo.id, 'A');
      const archiveList = (archived: boolean) =>
        http()
          .patch(`/api/v1/lists/${todo.id}`)
          .set('Authorization', owner.auth)
          .send({ archived })
          .expect(200);
      await patch(a.id, { archived: true }).expect(200);
      await archiveList(true);

      const res = await patch(a.id, { archived: false }).expect(400);
      expect(res.body.code).toBe(ErrorCode.INVALID_TARGET);

      await archiveList(false);
      await patch(a.id, { archived: false }).expect(200);
      expect((await columns()).Yapılacaklar).toEqual(['A']);
    });

    it('lists the active cards without ?archived', async () => {
      await createCard(todo.id, 'A');
      const res = await http()
        .get(`/api/v1/boards/${boardId}/cards`)
        .set('Authorization', owner.auth)
        .expect(200);
      expect(res.body.map((c: CardSummaryDto) => c.title)).toEqual(['A']);
    });

    it('rejects a null title, a non-boolean flag and unknown fields', async () => {
      const a = await createCard(todo.id, 'A');
      const res = await patch(a.id, { title: null, archived: 'yes', listId: done.id }).expect(400);
      const fields = (res.body.details as { field: string }[]).map((d) => d.field).sort();
      expect(fields).toEqual(['archived', 'listId', 'title']);
    });
  });

  describe('delete', () => {
    it('lets members delete cards for good', async () => {
      const a = await createCard(todo.id, 'A');
      const member = await createUser(app, 'Üye');
      await prisma.boardMember.create({
        data: { boardId, userId: member.user.id, role: 'MEMBER' },
      });

      await http().delete(`/api/v1/cards/${a.id}`).set('Authorization', member.auth).expect(204);

      expect((await columns()).Yapılacaklar).toEqual([]);
      await http().delete(`/api/v1/cards/${a.id}`).set('Authorization', owner.auth).expect(404);
    });

    it('goes with its list when the list is deleted', async () => {
      await createCard(todo.id, 'A');
      await http().delete(`/api/v1/lists/${todo.id}`).set('Authorization', owner.auth).expect(204);
      expect(await prisma.card.count()).toBe(0);
    });
  });

  describe('description flag', () => {
    it('omits the description text and flags cards that have one', async () => {
      const plain = await createCard(todo.id, 'Açıklamasız');
      const described = await createCard(todo.id, 'Açıklamalı');
      await prisma.card.update({ where: { id: described.id }, data: { description: 'Ayrıntı' } });

      const detail = await boardDetail();
      const listed = await http()
        .get(`/api/v1/boards/${boardId}/cards`)
        .set('Authorization', owner.auth)
        .expect(200);

      for (const cards of [detail.cards, listed.body as CardSummaryDto[]]) {
        expect(cards.map((card) => [card.id, card.hasDescription])).toEqual([
          [plain.id, false],
          [described.id, true],
        ]);
        for (const card of cards) expect(card).not.toHaveProperty('description');
      }
    });
  });

  describe('access', () => {
    it('hides cards of other boards behind 404', async () => {
      const a = await createCard(todo.id, 'A');
      const stranger = await createUser(app, 'Yabancı');
      const as = (req: request.Test) => req.set('Authorization', stranger.auth).expect(404);

      const res = await as(http().patch(`/api/v1/cards/${a.id}`).send({ title: 'X' }));
      expect(res.body.message).toBe('Card not found');
      await as(http().post(`/api/v1/cards/${a.id}/move`).send({ listId: todo.id }));
      await as(http().delete(`/api/v1/cards/${a.id}`));
      await as(http().get(`/api/v1/boards/${boardId}/cards`));
      const list = await as(http().post(`/api/v1/lists/${todo.id}/cards`).send({ title: 'X' }));
      expect(list.body.message).toBe('List not found');

      // A missing or malformed card id looks the same.
      await patch(MISSING_ID, { title: 'X' }).expect(404);
      await patch('nope', { title: 'X' }).expect(404);
    });

    it('does not let a card be moved into a board the user cannot see', async () => {
      const a = await createCard(todo.id, 'A');
      const stranger = await createUser(app, 'Yabancı');
      const strangerBoard = await createBoard(stranger, 'Gizli');
      const hidden = await createList('Gizli liste', strangerBoard, stranger);

      await move(a.id, { listId: hidden.id }).expect(400);
      expect(await prisma.card.count({ where: { listId: hidden.id } })).toBe(0);
    });
  });
});
