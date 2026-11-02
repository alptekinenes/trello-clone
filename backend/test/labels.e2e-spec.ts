import { INestApplication } from '@nestjs/common';
import { type BoardDetailDto, ErrorCode, type LabelDto } from '@trello/contracts';
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

describe('Labels (e2e, database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: TestUser;
  let boardId: string;
  let cardId: string;
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
    const list = await createList(app, owner, boardId);
    cardId = (await createCard(app, owner, list.id)).id;
  });

  async function createLabel(body: object, board = boardId, as = owner): Promise<LabelDto> {
    const res = await http()
      .post(`/api/v1/boards/${board}/labels`)
      .set('Authorization', as.auth)
      .send(body)
      .expect(201);
    return res.body as LabelDto;
  }

  async function boardDetail(): Promise<BoardDetailDto> {
    const res = await http()
      .get(`/api/v1/boards/${boardId}`)
      .set('Authorization', owner.auth)
      .expect(200);
    return res.body as BoardDetailDto;
  }

  function assign(card: string, label: string, as = owner) {
    return http().put(`/api/v1/cards/${card}/labels/${label}`).set('Authorization', as.auth);
  }

  function unassign(card: string, label: string, as = owner) {
    return http().delete(`/api/v1/cards/${card}/labels/${label}`).set('Authorization', as.auth);
  }

  describe('create', () => {
    it('creates a label, trims the name and defaults it to empty', async () => {
      const named = await createLabel({ name: '  Acil  ', color: 'RED' });
      const bare = await createLabel({ color: 'SKY' });

      expect(named).toEqual({ id: expect.any(String), boardId, name: 'Acil', color: 'RED' });
      expect(bare.name).toBe('');
      expect((await boardDetail()).labels).toHaveLength(8);
    });

    it('rejects a bad color, a long name and unknown fields', async () => {
      const post = (body: object) =>
        http().post(`/api/v1/boards/${boardId}/labels`).set('Authorization', owner.auth).send(body);

      await post({ color: 'TEAL' }).expect(400);
      await post({}).expect(400);
      await post({ color: 'RED', name: 'x'.repeat(51) }).expect(400);
      await post({ color: 'RED', boardId: MISSING_ID }).expect(400);
      await post({ color: 'RED', name: null }).expect(400);
    });

    it('lets a plain member manage labels', async () => {
      const member = await addMember(app, boardId, 'MEMBER');
      const created = await createLabel({ name: 'Üye', color: 'LIME' }, boardId, member);

      await http()
        .patch(`/api/v1/labels/${created.id}`)
        .set('Authorization', member.auth)
        .send({ name: 'Üye 2' })
        .expect(200);
      await http()
        .delete(`/api/v1/labels/${created.id}`)
        .set('Authorization', member.auth)
        .expect(204);
    });
  });

  describe('update', () => {
    it('renames and recolors', async () => {
      const label = await createLabel({ name: 'Eski', color: 'RED' });

      const res = await http()
        .patch(`/api/v1/labels/${label.id}`)
        .set('Authorization', owner.auth)
        .send({ name: '  Yeni ', color: 'BLUE' })
        .expect(200);

      expect(res.body).toEqual({ ...label, name: 'Yeni', color: 'BLUE' });
    });

    it('rejects a null name or color', async () => {
      const label = await createLabel({ color: 'RED' });
      const patch = (body: object) =>
        http().patch(`/api/v1/labels/${label.id}`).set('Authorization', owner.auth).send(body);

      await patch({ name: null }).expect(400);
      await patch({ color: null }).expect(400);
      await patch({ color: 'TEAL' }).expect(400);
    });
  });

  describe('delete', () => {
    it('removes the label from every card', async () => {
      const label = await createLabel({ name: 'Geçici', color: 'PINK' });
      await assign(cardId, label.id).expect(204);
      expect((await boardDetail()).cards[0].labelIds).toEqual([label.id]);

      await http()
        .delete(`/api/v1/labels/${label.id}`)
        .set('Authorization', owner.auth)
        .expect(204);

      expect((await boardDetail()).cards[0].labelIds).toEqual([]);
      expect(await prisma.cardLabel.count()).toBe(0);
      await http()
        .delete(`/api/v1/labels/${label.id}`)
        .set('Authorization', owner.auth)
        .expect(404);
    });

    it('goes away with the board', async () => {
      await http().delete(`/api/v1/boards/${boardId}`).set('Authorization', owner.auth).expect(204);
      expect(await prisma.label.count()).toBe(0);
    });
  });

  describe('assignment', () => {
    it('is idempotent in both directions', async () => {
      const label = await createLabel({ color: 'GREEN' });

      await assign(cardId, label.id).expect(204);
      await assign(cardId, label.id).expect(204);
      expect(await prisma.cardLabel.count({ where: { cardId } })).toBe(1);
      expect((await boardDetail()).cards[0].labelIds).toEqual([label.id]);

      await unassign(cardId, label.id).expect(204);
      await unassign(cardId, label.id).expect(204);
      expect(await prisma.cardLabel.count({ where: { cardId } })).toBe(0);
    });

    it('refuses a label of another board, a missing one and a malformed id', async () => {
      const stranger = await createUser(app, 'Yabancı');
      const otherBoard = await createBoard(app, stranger, 'Gizli');
      const foreign = await createLabel({ color: 'RED' }, otherBoard, stranger);

      for (const labelId of [foreign.id, MISSING_ID]) {
        const res = await assign(cardId, labelId).expect(400);
        expect(res.body.code).toBe(ErrorCode.LABEL_NOT_IN_BOARD);
      }
      const bad = await assign(cardId, 'nope').expect(400);
      expect(bad.body.code).toBe(ErrorCode.VALIDATION_FAILED);
      await unassign(cardId, 'nope').expect(400);
      expect(await prisma.cardLabel.count()).toBe(0);
    });

    it('does not touch another board through unassign', async () => {
      const stranger = await createUser(app, 'Yabancı');
      const otherBoard = await createBoard(app, stranger, 'Gizli');
      const otherList = await createList(app, stranger, otherBoard);
      const otherCard = await createCard(app, stranger, otherList.id);
      const foreign = await createLabel({ color: 'RED' }, otherBoard, stranger);
      await assign(otherCard.id, foreign.id, stranger).expect(204);

      await unassign(cardId, foreign.id).expect(204);

      expect(await prisma.cardLabel.count()).toBe(1);
    });
  });

  describe('access', () => {
    it('hides everything from non-members behind 404', async () => {
      const stranger = await createUser(app, 'Yabancı');
      const label = await createLabel({ color: 'RED' });
      const as = (req: request.Test) => req.set('Authorization', stranger.auth).expect(404);

      const create = await as(http().post(`/api/v1/boards/${boardId}/labels`).send({ color: 'RED' }));
      expect(create.body.message).toBe('Board not found');
      const update = await as(http().patch(`/api/v1/labels/${label.id}`).send({ name: 'X' }));
      expect(update.body.message).toBe('Label not found');
      await as(http().delete(`/api/v1/labels/${label.id}`));
      const put = await as(http().put(`/api/v1/cards/${cardId}/labels/${label.id}`));
      expect(put.body.message).toBe('Card not found');
      await as(http().delete(`/api/v1/cards/${cardId}/labels/${label.id}`));

      // A missing or malformed label id looks the same.
      await as(http().patch(`/api/v1/labels/${MISSING_ID}`).send({ name: 'X' }));
      await as(http().patch('/api/v1/labels/nope').send({ name: 'X' }));
      expect((await boardDetail()).labels.find((l) => l.id === label.id)).toBeDefined();
    });

    it('requires a token', async () => {
      await http().post(`/api/v1/boards/${boardId}/labels`).send({ color: 'RED' }).expect(401);
      await http().put(`/api/v1/cards/${cardId}/labels/${MISSING_ID}`).expect(401);
    });
  });
});
