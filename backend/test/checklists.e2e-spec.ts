import { INestApplication } from '@nestjs/common';
import {
  type BoardDetailDto,
  type CardDetailDto,
  type ChecklistDto,
  type ChecklistItemDto,
  type CardSummaryDto,
  ErrorCode,
  type ListDto,
  POSITION_GAP,
} from '@trello/contracts';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  addMember,
  createBoard,
  createCard,
  createList,
  MISSING_ID,
} from './utils/board-fixtures.js';
import { createTestApp } from './utils/create-test-app.js';
import { resetDatabase } from './utils/database.js';
import { createUser, type TestUser } from './utils/users.js';

describe('Checklists (e2e, database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: TestUser;
  let boardId: string;
  let list: ListDto;
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
    list = await createList(app, owner, boardId, 'Yapılacaklar');
    card = await createCard(app, owner, list.id, 'Kart');
  });

  async function createChecklist(title: string, cardId = card.id, as = owner): Promise<ChecklistDto> {
    const res = await http()
      .post(`/api/v1/cards/${cardId}/checklists`)
      .set('Authorization', as.auth)
      .send({ title })
      .expect(201);
    return res.body as ChecklistDto;
  }

  async function cardDetail(cardId = card.id): Promise<CardDetailDto> {
    const res = await http()
      .get(`/api/v1/cards/${cardId}`)
      .set('Authorization', owner.auth)
      .expect(200);
    return res.body as CardDetailDto;
  }

  /** Checklist titles in card order. */
  async function titles(cardId = card.id): Promise<string[]> {
    return (await cardDetail(cardId)).checklists.map((c) => c.title);
  }

  function moveChecklist(id: string, body: object, as = owner) {
    return http().post(`/api/v1/checklists/${id}/move`).set('Authorization', as.auth).send(body);
  }

  async function boardDetail(): Promise<BoardDetailDto> {
    const res = await http()
      .get(`/api/v1/boards/${boardId}`)
      .set('Authorization', owner.auth)
      .expect(200);
    return res.body as BoardDetailDto;
  }

  describe('create', () => {
    it('appends checklists to the end with spaced positions and trims the title', async () => {
      const first = await createChecklist('  Hazırlık  ');
      const second = await createChecklist('Yayın');

      expect(first).toEqual({
        id: expect.any(String),
        cardId: card.id,
        title: 'Hazırlık',
        position: POSITION_GAP,
        items: [],
      });
      expect(second.position).toBe(2 * POSITION_GAP);
      expect(await titles()).toEqual(['Hazırlık', 'Yayın']);
    });

    it('rejects an empty or 201 character title and unknown fields', async () => {
      const post = (body: object) =>
        http()
          .post(`/api/v1/cards/${card.id}/checklists`)
          .set('Authorization', owner.auth)
          .send(body);

      await post({ title: '   ' }).expect(400);
      await post({ title: 'x'.repeat(201) }).expect(400);
      await post({}).expect(400);
      await post({ title: 'A', position: 5 }).expect(400);
      await post({ title: 'x'.repeat(200) }).expect(201);
    });

    it('lets a plain member add checklists', async () => {
      const member = await addMember(app, boardId, 'MEMBER');
      await createChecklist('Üyenin', card.id, member);
      expect(await titles()).toEqual(['Üyenin']);
    });
  });

  describe('rename', () => {
    it('renames and returns the checklist with its items', async () => {
      const checklist = await createChecklist('Eski');
      await prisma.checklistItem.create({
        data: { checklistId: checklist.id, content: 'Madde', position: POSITION_GAP },
      });

      const res = await http()
        .patch(`/api/v1/checklists/${checklist.id}`)
        .set('Authorization', owner.auth)
        .send({ title: ' Yeni ' })
        .expect(200);

      expect(res.body).toMatchObject({ id: checklist.id, title: 'Yeni' });
      expect(res.body.items).toHaveLength(1);
    });

    it('rejects an empty title', async () => {
      const checklist = await createChecklist('Eski');
      await http()
        .patch(`/api/v1/checklists/${checklist.id}`)
        .set('Authorization', owner.auth)
        .send({ title: '' })
        .expect(400);
    });
  });

  describe('move', () => {
    let a: ChecklistDto;
    let b: ChecklistDto;
    let c: ChecklistDto;

    beforeEach(async () => {
      a = await createChecklist('A');
      b = await createChecklist('B');
      c = await createChecklist('C');
    });

    it('moves after an anchor, before an anchor and to the end', async () => {
      await moveChecklist(c.id, { afterChecklistId: a.id }).expect(200);
      expect(await titles()).toEqual(['A', 'C', 'B']);

      await moveChecklist(b.id, { beforeChecklistId: a.id }).expect(200);
      expect(await titles()).toEqual(['B', 'A', 'C']);

      const res = await moveChecklist(b.id, {}).expect(200);
      expect(await titles()).toEqual(['A', 'C', 'B']);
      expect(res.body).toEqual({ id: b.id, position: expect.any(Number) });
    });

    it('answers 409 POSITION_CONFLICT for a stale anchor', async () => {
      await http()
        .delete(`/api/v1/checklists/${a.id}`)
        .set('Authorization', owner.auth)
        .expect(204);

      const res = await moveChecklist(c.id, { afterChecklistId: a.id }).expect(409);

      expect(res.body.code).toBe(ErrorCode.POSITION_CONFLICT);
      expect(await titles()).toEqual(['B', 'C']);
    });

    it('answers 409 when the anchor is a checklist of another card', async () => {
      const otherCard = await createCard(app, owner, list.id, 'Başka');
      const foreign = await createChecklist('Yabancı', otherCard.id);

      const res = await moveChecklist(c.id, { afterChecklistId: foreign.id }).expect(409);

      expect(res.body.code).toBe(ErrorCode.POSITION_CONFLICT);
      expect(await titles()).toEqual(['A', 'B', 'C']);
    });

    it('rebalances when positions get too close, keeping the order', async () => {
      await prisma.checklist.update({ where: { id: b.id }, data: { position: a.position + 1e-7 } });

      await moveChecklist(c.id, { afterChecklistId: a.id }).expect(200);

      expect(await titles()).toEqual(['A', 'C', 'B']);
      const rows = await prisma.checklist.findMany({
        where: { cardId: card.id },
        orderBy: { position: 'asc' },
        select: { position: true },
      });
      expect(rows.map((r) => r.position)).toEqual([1, 2, 3].map((i) => i * POSITION_GAP));
    });

    it('rejects a raw position and malformed anchors', async () => {
      await moveChecklist(c.id, { position: 5 }).expect(400);
      await moveChecklist(c.id, { afterChecklistId: 'nope' }).expect(400);
    });
  });

  describe('delete and cascade', () => {
    it('removes the checklist and its items', async () => {
      const checklist = await createChecklist('Silinecek');
      await prisma.checklistItem.createMany({
        data: [
          { checklistId: checklist.id, content: 'A', position: 1024 },
          { checklistId: checklist.id, content: 'B', position: 2048 },
        ],
      });

      await http()
        .delete(`/api/v1/checklists/${checklist.id}`)
        .set('Authorization', owner.auth)
        .expect(204);

      expect(await prisma.checklistItem.count()).toBe(0);
      expect(await titles()).toEqual([]);
      await http()
        .delete(`/api/v1/checklists/${checklist.id}`)
        .set('Authorization', owner.auth)
        .expect(404);
    });

    it('deletes checklists, items and card labels together with the card', async () => {
      const checklist = await createChecklist('Liste');
      await prisma.checklistItem.create({
        data: { checklistId: checklist.id, content: 'A', position: 1024 },
      });
      const label = await prisma.label.findFirstOrThrow({ where: { boardId } });
      await prisma.cardLabel.create({ data: { cardId: card.id, labelId: label.id } });

      await http().delete(`/api/v1/cards/${card.id}`).set('Authorization', owner.auth).expect(204);

      expect(await prisma.checklist.count()).toBe(0);
      expect(await prisma.checklistItem.count()).toBe(0);
      expect(await prisma.cardLabel.count()).toBe(0);
    });

    it('deletes everything below a list when the list is deleted', async () => {
      const checklist = await createChecklist('Liste');
      await prisma.checklistItem.create({
        data: { checklistId: checklist.id, content: 'A', position: 1024 },
      });

      await http().delete(`/api/v1/lists/${list.id}`).set('Authorization', owner.auth).expect(204);

      expect(await prisma.card.count()).toBe(0);
      expect(await prisma.checklist.count()).toBe(0);
      expect(await prisma.checklistItem.count()).toBe(0);
    });
  });

  describe('items', () => {
    let todo: ChecklistDto;
    let doing: ChecklistDto;

    beforeEach(async () => {
      todo = await createChecklist('Yapılacak');
      doing = await createChecklist('Yapılıyor');
    });

    async function createItem(
      checklistId: string,
      content: string,
      as = owner,
    ): Promise<ChecklistItemDto> {
      const res = await http()
        .post(`/api/v1/checklists/${checklistId}/items`)
        .set('Authorization', as.auth)
        .send({ content })
        .expect(201);
      return res.body as ChecklistItemDto;
    }

    function patchItem(id: string, body: object, as = owner) {
      return http().patch(`/api/v1/checklist-items/${id}`).set('Authorization', as.auth).send(body);
    }

    function moveItem(id: string, body: object, as = owner) {
      return http()
        .post(`/api/v1/checklist-items/${id}/move`)
        .set('Authorization', as.auth)
        .send(body);
    }

    /** Item contents per checklist title, in card order. */
    async function layout(): Promise<Record<string, string[]>> {
      const detail = await cardDetail();
      return Object.fromEntries(
        detail.checklists.map((c) => [c.title, c.items.map((i) => i.content)]),
      );
    }

    describe('create', () => {
      it('appends items to the end with spaced positions and trims the content', async () => {
        const first = await createItem(todo.id, '  Taslak  ');
        const second = await createItem(todo.id, 'Gözden geçir');

        expect(first).toEqual({
          id: expect.any(String),
          checklistId: todo.id,
          content: 'Taslak',
          isCompleted: false,
          position: POSITION_GAP,
        });
        expect(second.position).toBe(2 * POSITION_GAP);
        expect(await layout()).toEqual({
          Yapılacak: ['Taslak', 'Gözden geçir'],
          Yapılıyor: [],
        });
      });

      it('rejects blank, 501 character and unexpected input', async () => {
        const post = (body: object) =>
          http()
            .post(`/api/v1/checklists/${todo.id}/items`)
            .set('Authorization', owner.auth)
            .send(body);

        await post({ content: '  ' }).expect(400);
        await post({ content: 'x'.repeat(501) }).expect(400);
        await post({}).expect(400);
        await post({ content: 'A', isCompleted: true }).expect(400);
        await post({ content: 'x'.repeat(500) }).expect(201);
      });
    });

    describe('update and counters', () => {
      it('edits and toggles an item, and the board detail counts follow', async () => {
        const a = await createItem(todo.id, 'A');
        await createItem(todo.id, 'B');
        await createItem(doing.id, 'C');
        expect((await boardDetail()).cards[0]).toMatchObject({
          checklistTotal: 3,
          checklistDone: 0,
        });

        const done = await patchItem(a.id, { isCompleted: true }).expect(200);
        expect(done.body).toMatchObject({ id: a.id, isCompleted: true, content: 'A' });
        expect((await boardDetail()).cards[0]).toMatchObject({
          checklistTotal: 3,
          checklistDone: 1,
        });

        const renamed = await patchItem(a.id, { content: ' Yeni ', isCompleted: false }).expect(200);
        expect(renamed.body).toMatchObject({ content: 'Yeni', isCompleted: false });
        expect((await boardDetail()).cards[0].checklistDone).toBe(0);
      });

      it('rejects null, blank and unknown fields', async () => {
        const a = await createItem(todo.id, 'A');

        await patchItem(a.id, { content: null }).expect(400);
        await patchItem(a.id, { content: '  ' }).expect(400);
        await patchItem(a.id, { isCompleted: null }).expect(400);
        await patchItem(a.id, { isCompleted: 'yes' }).expect(400);
        await patchItem(a.id, { checklistId: doing.id }).expect(400);
        await patchItem(a.id, { position: 3 }).expect(400);
      });
    });

    describe('move', () => {
      let a: ChecklistItemDto;
      let b: ChecklistItemDto;
      let c: ChecklistItemDto;
      let x: ChecklistItemDto;

      beforeEach(async () => {
        a = await createItem(todo.id, 'A');
        b = await createItem(todo.id, 'B');
        c = await createItem(todo.id, 'C');
        x = await createItem(doing.id, 'X');
        await patchItem(a.id, { isCompleted: true }).expect(200);
      });

      it('reorders inside a checklist', async () => {
        await moveItem(c.id, { checklistId: todo.id, afterItemId: a.id }).expect(200);
        expect((await layout()).Yapılacak).toEqual(['A', 'C', 'B']);

        await moveItem(b.id, { checklistId: todo.id, beforeItemId: a.id }).expect(200);
        expect((await layout()).Yapılacak).toEqual(['B', 'A', 'C']);

        await moveItem(b.id, { checklistId: todo.id }).expect(200);
        expect((await layout()).Yapılacak).toEqual(['A', 'C', 'B']);
      });

      it('moves to another checklist of the same card and keeps the counters', async () => {
        const res = await moveItem(a.id, { checklistId: doing.id, afterItemId: x.id }).expect(200);

        expect(res.body).toEqual({ id: a.id, checklistId: doing.id, position: expect.any(Number) });
        expect(await layout()).toEqual({ Yapılacak: ['B', 'C'], Yapılıyor: ['X', 'A'] });
        const detail = await cardDetail();
        expect(detail.checklists[1].items.at(-1)).toMatchObject({ content: 'A', isCompleted: true });
        expect(detail).toMatchObject({ checklistTotal: 4, checklistDone: 1 });
        expect((await boardDetail()).cards[0]).toMatchObject({
          checklistTotal: 4,
          checklistDone: 1,
        });
      });

      it('moves into an empty checklist', async () => {
        const empty = await createChecklist('Boş');

        await moveItem(b.id, { checklistId: empty.id }).expect(200);

        expect((await layout()).Boş).toEqual(['B']);
      });

      it('refuses a checklist of another card with 400 INVALID_TARGET', async () => {
        const otherCard = await createCard(app, owner, list.id, 'Başka');
        const foreign = await createChecklist('Yabancı', otherCard.id);

        const res = await moveItem(a.id, { checklistId: foreign.id }).expect(400);

        expect(res.body.code).toBe(ErrorCode.INVALID_TARGET);
        expect((await layout()).Yapılacak).toEqual(['A', 'B', 'C']);
      });

      it('refuses a checklist of another board and a missing one with 400', async () => {
        const stranger = await createUser(app, 'Yabancı');
        const otherBoard = await createBoard(app, stranger, 'Gizli');
        const otherList = await createList(app, stranger, otherBoard);
        const otherCard = await createCard(app, stranger, otherList.id);
        const foreign = await createChecklist('Gizli', otherCard.id, stranger);

        for (const checklistId of [foreign.id, MISSING_ID]) {
          const res = await moveItem(a.id, { checklistId }).expect(400);
          expect(res.body.code).toBe(ErrorCode.INVALID_TARGET);
        }
        expect(await prisma.checklistItem.count({ where: { checklistId: foreign.id } })).toBe(0);
      });

      it('answers 409 POSITION_CONFLICT for an anchor in another checklist or a deleted one', async () => {
        const inOther = await moveItem(a.id, { checklistId: doing.id, afterItemId: b.id }).expect(409);
        expect(inOther.body.code).toBe(ErrorCode.POSITION_CONFLICT);

        await http()
          .delete(`/api/v1/checklist-items/${x.id}`)
          .set('Authorization', owner.auth)
          .expect(204);
        const gone = await moveItem(a.id, { checklistId: doing.id, beforeItemId: x.id }).expect(409);
        expect(gone.body.code).toBe(ErrorCode.POSITION_CONFLICT);

        expect(await layout()).toEqual({ Yapılacak: ['A', 'B', 'C'], Yapılıyor: [] });
      });

      it('requires a valid checklistId and rejects a raw position', async () => {
        await moveItem(a.id, {}).expect(400);
        await moveItem(a.id, { checklistId: 'nope' }).expect(400);
        await moveItem(a.id, { checklistId: todo.id, position: 4 }).expect(400);
      });

      it('rebalances when positions get too close, keeping the order', async () => {
        await prisma.checklistItem.update({
          where: { id: b.id },
          data: { position: a.position + 1e-7 },
        });

        await moveItem(x.id, { checklistId: todo.id, afterItemId: a.id }).expect(200);

        expect((await layout()).Yapılacak).toEqual(['A', 'X', 'B', 'C']);
        const rows = await prisma.checklistItem.findMany({
          where: { checklistId: todo.id },
          orderBy: { position: 'asc' },
          select: { position: true },
        });
        expect(rows.map((r) => r.position)).toEqual([1, 2, 3, 4].map((i) => i * POSITION_GAP));
      });
    });

    describe('delete', () => {
      it('removes the item and the counters follow', async () => {
        const a = await createItem(todo.id, 'A');
        await createItem(todo.id, 'B');
        await patchItem(a.id, { isCompleted: true }).expect(200);

        await http()
          .delete(`/api/v1/checklist-items/${a.id}`)
          .set('Authorization', owner.auth)
          .expect(204);

        expect((await boardDetail()).cards[0]).toMatchObject({
          checklistTotal: 1,
          checklistDone: 0,
        });
        await http()
          .delete(`/api/v1/checklist-items/${a.id}`)
          .set('Authorization', owner.auth)
          .expect(404);
      });
    });

    describe('concurrency', () => {
      it('keeps positions unique and totals right under 20 parallel writes', async () => {
        const left: ChecklistItemDto[] = [];
        const right: ChecklistItemDto[] = [];
        for (const content of ['A', 'B', 'C', 'D']) left.push(await createItem(todo.id, content));
        for (const content of ['E', 'F', 'G', 'H']) right.push(await createItem(doing.id, content));
        const all = [...left, ...right];

        const requests = [
          // 10 moves between the two checklists; some anchors go stale.
          ...all.slice(0, 5).map((item, i) =>
            moveItem(item.id, {
              checklistId: item.checklistId === todo.id ? doing.id : todo.id,
              ...(i % 2 === 0 ? { afterItemId: all[7 - i].id } : {}),
            }).then((res) => ({ kind: 'move', status: res.status })),
          ),
          ...all.slice(3, 8).map((item) =>
            moveItem(item.id, { checklistId: todo.id }).then((res) => ({
              kind: 'move',
              status: res.status,
            })),
          ),
          // 6 creates.
          ...[todo, doing, todo, doing, todo, doing].map((checklist, i) =>
            http()
              .post(`/api/v1/checklists/${checklist.id}/items`)
              .set('Authorization', owner.auth)
              .send({ content: `Yeni ${i}` })
              .then((res) => ({ kind: 'create', status: res.status })),
          ),
          // 4 deletes of distinct items.
          ...[all[0], all[3], all[5], all[7]].map((item) =>
            http()
              .delete(`/api/v1/checklist-items/${item.id}`)
              .set('Authorization', owner.auth)
              .then((res) => ({ kind: 'delete', status: res.status })),
          ),
        ];
        expect(requests).toHaveLength(20);

        const results = await Promise.all(requests);

        const allowed: Record<string, number[]> = {
          move: [200, 404, 409],
          create: [201],
          delete: [204],
        };
        for (const { kind, status } of results) expect(allowed[kind]).toContain(status);

        const detail = await cardDetail();
        for (const checklist of detail.checklists) {
          const positions = checklist.items.map((i) => i.position);
          expect(new Set(positions).size).toBe(positions.length);
          expect(positions).toEqual([...positions].sort((p, q) => p - q));
        }
        // 8 items + 6 created - 4 deleted; a move never adds or drops an item.
        const total = detail.checklists.reduce((sum, c) => sum + c.items.length, 0);
        expect(total).toBe(10);
        expect(detail.checklistTotal).toBe(10);
        expect(await prisma.checklistItem.count()).toBe(10);
      });

      it('survives a checklist being deleted while items move into it', async () => {
        const items: ChecklistItemDto[] = [];
        for (const content of ['A', 'B', 'C', 'D']) items.push(await createItem(todo.id, content));

        const results = await Promise.all([
          http()
            .delete(`/api/v1/checklists/${doing.id}`)
            .set('Authorization', owner.auth)
            .then((res) => res.status),
          ...items.map((item) => moveItem(item.id, { checklistId: doing.id }).then((r) => r.status)),
        ]);

        expect(results[0]).toBe(204);
        for (const status of results.slice(1)) expect([200, 400]).toContain(status);
        // Items either went down with the checklist or never left the first one.
        const remaining = await prisma.checklistItem.findMany({ select: { checklistId: true } });
        expect(remaining.every((r) => r.checklistId === todo.id)).toBe(true);
      });
    });

    describe('cascade', () => {
      it('removes items with their checklist', async () => {
        await createItem(todo.id, 'A');
        await http()
          .delete(`/api/v1/checklists/${todo.id}`)
          .set('Authorization', owner.auth)
          .expect(204);
        expect(await prisma.checklistItem.count()).toBe(0);
      });
    });

    describe('access', () => {
      it('hides items from non-members behind 404', async () => {
        const item = await createItem(todo.id, 'Gizli');
        const stranger = await createUser(app, 'Yabancı');
        const as = (req: request.Test) => req.set('Authorization', stranger.auth).expect(404);

        const create = await as(
          http().post(`/api/v1/checklists/${todo.id}/items`).send({ content: 'X' }),
        );
        expect(create.body.message).toBe('Checklist not found');
        const update = await as(
          http().patch(`/api/v1/checklist-items/${item.id}`).send({ isCompleted: true }),
        );
        expect(update.body.message).toBe('Checklist item not found');
        await as(http().post(`/api/v1/checklist-items/${item.id}/move`).send({ checklistId: doing.id }));
        await as(http().delete(`/api/v1/checklist-items/${item.id}`));

        // A missing or malformed id looks the same.
        await as(http().delete(`/api/v1/checklist-items/${MISSING_ID}`));
        await as(http().delete('/api/v1/checklist-items/nope'));
        expect(await layout()).toEqual({ Yapılacak: ['Gizli'], Yapılıyor: [] });
      });

      it('lets a plain member work with items', async () => {
        const member = await addMember(app, boardId, 'MEMBER');
        const item = await createItem(todo.id, 'Üyenin', member);
        await patchItem(item.id, { isCompleted: true }, member).expect(200);
        await moveItem(item.id, { checklistId: doing.id }, member).expect(200);
        await http()
          .delete(`/api/v1/checklist-items/${item.id}`)
          .set('Authorization', member.auth)
          .expect(204);
      });

      it('requires a token', async () => {
        await http().post(`/api/v1/checklists/${todo.id}/items`).send({ content: 'X' }).expect(401);
        await http().delete(`/api/v1/checklist-items/${MISSING_ID}`).expect(401);
      });
    });
  });

  describe('access', () => {
    it('hides checklists from non-members behind 404', async () => {
      const checklist = await createChecklist('Gizli');
      const stranger = await createUser(app, 'Yabancı');
      const as = (req: request.Test) => req.set('Authorization', stranger.auth).expect(404);

      const create = await as(
        http().post(`/api/v1/cards/${card.id}/checklists`).send({ title: 'X' }),
      );
      expect(create.body.message).toBe('Card not found');
      const rename = await as(http().patch(`/api/v1/checklists/${checklist.id}`).send({ title: 'X' }));
      expect(rename.body.message).toBe('Checklist not found');
      await as(http().post(`/api/v1/checklists/${checklist.id}/move`).send({}));
      await as(http().delete(`/api/v1/checklists/${checklist.id}`));

      // A missing or malformed id looks the same.
      await as(http().delete(`/api/v1/checklists/${MISSING_ID}`));
      await as(http().delete('/api/v1/checklists/nope'));
      expect(await titles()).toEqual(['Gizli']);
    });

    it('requires a token', async () => {
      await http().post(`/api/v1/cards/${card.id}/checklists`).send({ title: 'X' }).expect(401);
    });

    it('counts an empty checklist as zero items in the board detail', async () => {
      await createChecklist('Liste');
      const detail = await boardDetail();
      expect(detail.cards[0]).toMatchObject({ checklistTotal: 0, checklistDone: 0 });
    });
  });
});
