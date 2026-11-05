import { INestApplication } from '@nestjs/common';
import { type BoardDetailDto, type CardSummaryDto, ErrorCode } from '@trello/contracts';
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

describe('Card completion, cover, members and watching (e2e, database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: TestUser;
  let member: TestUser;
  let boardId: string;
  let listId: string;
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
    member = await addMember(app, boardId, 'MEMBER', 'Üye');
    listId = (await createList(app, owner, boardId)).id;
    cardId = (await createCard(app, owner, listId)).id;
  });

  const put = (path: string, as = owner) => http().put(`/api/v1${path}`).set('Authorization', as.auth);
  const del = (path: string, as = owner) =>
    http().delete(`/api/v1${path}`).set('Authorization', as.auth);
  const patch = (body: object, card = cardId, as = owner) =>
    http().patch(`/api/v1/cards/${card}`).set('Authorization', as.auth).send(body);

  async function boardDetail(as = owner, board = boardId): Promise<BoardDetailDto> {
    const res = await http()
      .get(`/api/v1/boards/${board}`)
      .set('Authorization', as.auth)
      .expect(200);
    return res.body as BoardDetailDto;
  }

  describe('completion and cover', () => {
    it('completes, keeps the first time and clears', async () => {
      const first = (await patch({ isCompleted: true }).expect(200)).body as CardSummaryDto;
      expect(first.completedAt).toEqual(expect.any(String));

      const again = (await patch({ isCompleted: true }).expect(200)).body as CardSummaryDto;
      expect(again.completedAt).toBe(first.completedAt);

      const cleared = (await patch({ isCompleted: false }).expect(200)).body as CardSummaryDto;
      expect(cleared.completedAt).toBeNull();
    });

    it('sets and removes the cover color', async () => {
      expect((await patch({ coverColor: 'BLUE' }).expect(200)).body).toMatchObject({
        coverColor: 'BLUE',
      });
      expect((await patch({ coverColor: null }).expect(200)).body).toMatchObject({
        coverColor: null,
      });
    });

    it('is independent of dueComplete', async () => {
      const res = await patch({ isCompleted: true }).expect(200);
      expect(res.body).toMatchObject({ dueComplete: false });
    });

    it('rejects null isCompleted and a color outside the palette', async () => {
      for (const body of [{ isCompleted: null }, { isCompleted: 'yes' }, { coverColor: 'red' }]) {
        const res = await patch(body).expect(400);
        expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
      }
    });

    it('is shown on the board page', async () => {
      await patch({ isCompleted: true, coverColor: 'PINK' }).expect(200);

      const [card] = (await boardDetail()).cards;
      expect(card).toMatchObject({ coverColor: 'PINK', completedAt: expect.any(String) });
    });
  });

  describe('members', () => {
    it('assigns and unassigns, idempotently, in assignment order', async () => {
      await put(`/cards/${cardId}/members/${member.user.id}`).expect(204);
      await put(`/cards/${cardId}/members/${member.user.id}`).expect(204);
      await put(`/cards/${cardId}/members/${owner.user.id}`).expect(204);

      expect((await boardDetail()).cards[0].memberIds).toEqual([member.user.id, owner.user.id]);

      await del(`/cards/${cardId}/members/${member.user.id}`).expect(204);
      await del(`/cards/${cardId}/members/${member.user.id}`).expect(204);
      expect((await boardDetail()).cards[0].memberIds).toEqual([owner.user.id]);
    });

    it('lets a plain member assign someone else', async () => {
      await put(`/cards/${cardId}/members/${owner.user.id}`, member).expect(204);
    });

    it('refuses a user who is not on the board with 400 NOT_BOARD_MEMBER', async () => {
      const stranger = await createUser(app, 'Yabancı');

      for (const userId of [stranger.user.id, MISSING_ID]) {
        const res = await put(`/cards/${cardId}/members/${userId}`).expect(400);
        expect(res.body.code).toBe(ErrorCode.NOT_BOARD_MEMBER);
      }
      expect(await prisma.cardMember.count()).toBe(0);
    });

    it('refuses a malformed user id', async () => {
      const res = await put(`/cards/${cardId}/members/not-a-uuid`).expect(400);
      expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
      await del(`/cards/${cardId}/members/not-a-uuid`).expect(400);
    });

    it('hides the card from non-members and from other boards behind 404', async () => {
      const stranger = await createUser(app, 'Yabancı');
      const otherBoard = await createBoard(app, stranger, 'Başka');
      const otherList = await createList(app, stranger, otherBoard);
      const otherCard = (await createCard(app, stranger, otherList.id)).id;

      await put(`/cards/${cardId}/members/${member.user.id}`, stranger).expect(404);
      await del(`/cards/${cardId}/members/${member.user.id}`, stranger).expect(404);
      await put(`/cards/${MISSING_ID}/members/${member.user.id}`).expect(404);
      // The owner of board A cannot touch the card of board B.
      await put(`/cards/${otherCard}/members/${member.user.id}`).expect(404);
      expect(await prisma.cardMember.count()).toBe(0);
    });

    it('requires a token', async () => {
      await http().put(`/api/v1/cards/${cardId}/members/${member.user.id}`).expect(401);
      await http().put(`/api/v1/cards/${cardId}/watch`).expect(401);
    });

    it('is cleaned up when the member leaves, only on that board', async () => {
      const otherBoard = await createBoard(app, owner, 'Başka');
      await prisma.boardMember.create({
        data: { boardId: otherBoard, userId: member.user.id, role: 'MEMBER' },
      });
      const otherList = await createList(app, owner, otherBoard);
      const otherCard = (await createCard(app, owner, otherList.id)).id;
      for (const card of [cardId, otherCard]) {
        await put(`/cards/${card}/members/${member.user.id}`).expect(204);
        await put(`/cards/${card}/watch`, member).expect(204);
      }

      await del(`/boards/${boardId}/members/${member.user.id}`).expect(204);

      const rows = await prisma.cardMember.findMany({ select: { cardId: true } });
      expect(rows).toEqual([{ cardId: otherCard }]);
      const watches = await prisma.cardWatch.findMany({ select: { cardId: true } });
      expect(watches).toEqual([{ cardId: otherCard }]);
    });

    it('goes away with the card', async () => {
      await put(`/cards/${cardId}/members/${member.user.id}`).expect(204);
      await del(`/cards/${cardId}`).expect(204);
      expect(await prisma.cardMember.count()).toBe(0);
    });
  });

  describe('watching', () => {
    it('watches and unwatches idempotently, privately per user', async () => {
      await put(`/cards/${cardId}/watch`).expect(204);
      await put(`/cards/${cardId}/watch`).expect(204);

      expect((await boardDetail()).myWatchedCardIds).toEqual([cardId]);
      expect((await boardDetail(member)).myWatchedCardIds).toEqual([]);
      const card = (await boardDetail(member)).cards[0];
      expect(JSON.stringify(card)).not.toContain('watch');

      await del(`/cards/${cardId}/watch`).expect(204);
      await del(`/cards/${cardId}/watch`).expect(204);
      expect((await boardDetail()).myWatchedCardIds).toEqual([]);
    });

    it('only ever watches for the requester', async () => {
      await put(`/cards/${cardId}/watch`, member).expect(204);

      const rows = await prisma.cardWatch.findMany({ select: { userId: true } });
      expect(rows).toEqual([{ userId: member.user.id }]);
    });

    it('includes archived cards in myWatchedCardIds', async () => {
      await put(`/cards/${cardId}/watch`).expect(204);
      await patch({ archived: true }).expect(200);

      expect((await boardDetail()).myWatchedCardIds).toEqual([cardId]);
    });

    it('hides the card from non-members behind 404', async () => {
      const stranger = await createUser(app, 'Yabancı');

      await put(`/cards/${cardId}/watch`, stranger).expect(404);
      await del(`/cards/${cardId}/watch`, stranger).expect(404);
      await put(`/cards/${MISSING_ID}/watch`).expect(404);
      expect(await prisma.cardWatch.count()).toBe(0);
    });
  });
});
