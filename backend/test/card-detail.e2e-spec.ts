import { INestApplication } from '@nestjs/common';
import type { BoardDetailDto, CardDetailDto, CardSummaryDto, ListDto } from '@trello/contracts';
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

describe('Card detail (e2e, database)', () => {
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

  function patch(body: object, cardId = card.id, as = owner) {
    return http().patch(`/api/v1/cards/${cardId}`).set('Authorization', as.auth).send(body);
  }

  function detail(cardId = card.id, as = owner) {
    return http().get(`/api/v1/cards/${cardId}`).set('Authorization', as.auth);
  }

  describe('GET /cards/:cardId', () => {
    it('returns the full detail of a fresh card', async () => {
      const res = await detail().expect(200);

      expect(res.body).toEqual({
        ...card,
        boardId,
        description: null,
        checklists: [],
      } satisfies CardDetailDto);
    });

    it('returns the description and checklists in order', async () => {
      await prisma.card.update({ where: { id: card.id }, data: { description: 'Metin' } });
      const second = await prisma.checklist.create({
        data: { cardId: card.id, title: 'İkinci', position: 2048 },
      });
      const first = await prisma.checklist.create({
        data: { cardId: card.id, title: 'Birinci', position: 1024 },
      });
      await prisma.checklistItem.createMany({
        data: [
          { checklistId: first.id, content: 'B', position: 2048, isCompleted: true },
          { checklistId: first.id, content: 'A', position: 1024 },
        ],
      });

      const body = (await detail().expect(200)).body as CardDetailDto;

      expect(body.description).toBe('Metin');
      expect(body.hasDescription).toBe(true);
      expect(body.checklists.map((c) => c.title)).toEqual(['Birinci', 'İkinci']);
      expect(body.checklists[0].items.map((i) => i.content)).toEqual(['A', 'B']);
      expect(body.checklists[1].id).toBe(second.id);
      expect(body).toMatchObject({ checklistTotal: 2, checklistDone: 1 });
    });

    it('also returns an archived card', async () => {
      await patch({ archived: true }).expect(200);

      const body = (await detail().expect(200)).body as CardDetailDto;

      expect(body.archivedAt).toEqual(expect.any(String));
    });

    it('answers 404 Card not found to non-members and for unknown ids', async () => {
      const stranger = await createUser(app, 'Yabancı');

      for (const res of [
        await detail(card.id, stranger).expect(404),
        await detail(MISSING_ID).expect(404),
        await detail('nope').expect(404),
      ]) {
        expect(res.body.message).toBe('Card not found');
      }
    });

    it('requires a token', async () => {
      await http().get(`/api/v1/cards/${card.id}`).expect(401);
    });

    it('is readable by a plain member', async () => {
      const member = await addMember(app, boardId, 'MEMBER');
      await detail(card.id, member).expect(200);
    });
  });

  describe('PATCH description', () => {
    it('writes the text and flags the summary', async () => {
      const res = await patch({ description: '  Ayrıntılı açıklama  ' }).expect(200);

      expect(res.body.hasDescription).toBe(true);
      expect(res.body).not.toHaveProperty('description');
      expect((await detail()).body.description).toBe('Ayrıntılı açıklama');
    });

    it('clears the description with whitespace or null', async () => {
      await patch({ description: 'Metin' }).expect(200);

      const blank = await patch({ description: '   ' }).expect(200);
      expect(blank.body.hasDescription).toBe(false);
      expect((await detail()).body.description).toBeNull();

      await patch({ description: 'Tekrar' }).expect(200);
      const cleared = await patch({ description: null }).expect(200);
      expect(cleared.body.hasDescription).toBe(false);
      expect((await detail()).body.description).toBeNull();
    });

    it('stores 10000 characters and rejects 10001', async () => {
      await patch({ description: 'x'.repeat(10_000) }).expect(200);
      expect((await detail()).body.description).toHaveLength(10_000);

      await patch({ description: 'x'.repeat(10_001) }).expect(400);
      expect((await detail()).body.description).toHaveLength(10_000);
    });

    it('rejects a number', async () => {
      await patch({ description: 5 }).expect(400);
    });

    it('is not part of the board detail', async () => {
      await patch({ description: 'Metin' }).expect(200);

      const board = (
        await http().get(`/api/v1/boards/${boardId}`).set('Authorization', owner.auth).expect(200)
      ).body as BoardDetailDto;

      expect(board.cards[0].hasDescription).toBe(true);
      expect(board.cards[0]).not.toHaveProperty('description');
    });
  });

  describe('PATCH due date', () => {
    it('returns a UTC date unchanged', async () => {
      const res = await patch({ dueDate: '2026-11-05T12:00:00.000Z' }).expect(200);
      expect(res.body.dueDate).toBe('2026-11-05T12:00:00.000Z');
    });

    it('converts an offset to UTC', async () => {
      const res = await patch({ dueDate: '2026-11-05T15:00:00+03:00' }).expect(200);
      expect(res.body.dueDate).toBe('2026-11-05T12:00:00.000Z');
    });

    it.each(['2026-11-05T12:00:00', '2026-11-05', 'yarın'])('rejects %s', async (dueDate) => {
      await patch({ dueDate }).expect(400);
    });

    it('marks the date complete and resets it when the date is cleared', async () => {
      await patch({ dueDate: '2026-11-05T12:00:00Z' }).expect(200);
      const done = await patch({ dueComplete: true }).expect(200);
      expect(done.body).toMatchObject({ dueComplete: true, dueDate: '2026-11-05T12:00:00.000Z' });

      const cleared = await patch({ dueDate: null }).expect(200);
      expect(cleared.body).toMatchObject({ dueDate: null, dueComplete: false });
    });

    it('rejects null and text for dueComplete', async () => {
      await patch({ dueComplete: null }).expect(400);
      await patch({ dueComplete: 'yes' }).expect(400);
    });
  });

  describe('access', () => {
    it('keeps strangers from editing and hides the card behind 404', async () => {
      const stranger = await createUser(app, 'Yabancı');
      const res = await patch({ description: 'Hack' }, card.id, stranger).expect(404);

      expect(res.body.message).toBe('Card not found');
      expect((await detail()).body.description).toBeNull();
    });
  });
});
