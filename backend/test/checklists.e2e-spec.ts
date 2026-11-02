import { INestApplication } from '@nestjs/common';
import {
  type BoardDetailDto,
  type CardDetailDto,
  type ChecklistDto,
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
