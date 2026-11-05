import { INestApplication } from '@nestjs/common';
import {
  type BoardDetailDto,
  type CardFeedPageDto,
  COMMENT_LIMITS,
  type CommentDto,
  ErrorCode,
  type FeedItemDto,
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

describe('Card comments and feed (e2e, database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: TestUser;
  let admin: TestUser;
  let member: TestUser;
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
    admin = await addMember(app, boardId, 'ADMIN', 'Yönetici');
    member = await addMember(app, boardId, 'MEMBER', 'Üye');
    const list = await createList(app, owner, boardId);
    cardId = (await createCard(app, owner, list.id)).id;
  });

  const post = (body: object, card = cardId, as = owner) =>
    http().post(`/api/v1/cards/${card}/comments`).set('Authorization', as.auth).send(body);
  const patch = (id: string, body: object, as = owner) =>
    http().patch(`/api/v1/comments/${id}`).set('Authorization', as.auth).send(body);
  const del = (id: string, as = owner) =>
    http().delete(`/api/v1/comments/${id}`).set('Authorization', as.auth);
  const feed = (query = '', card = cardId, as = owner) =>
    http().get(`/api/v1/cards/${card}/feed${query}`).set('Authorization', as.auth);

  async function addComment(body = 'Yorum', as = owner): Promise<CommentDto> {
    return (await post({ body }, cardId, as).expect(201)).body as CommentDto;
  }

  async function commentCountOnBoard(as = owner): Promise<number> {
    const res = await http().get(`/api/v1/boards/${boardId}`).set('Authorization', as.auth).expect(200);
    return (res.body as BoardDetailDto).cards[0].commentCount;
  }

  describe('create', () => {
    it('creates a comment with the author reference and no e-mail address', async () => {
      const res = await post({ body: '  Merhaba\ndünya  ' }).expect(201);

      expect(res.body).toEqual({
        kind: 'comment',
        id: expect.any(String),
        cardId,
        author: { id: owner.user.id, name: 'Sahip', avatarUrl: null },
        body: 'Merhaba\ndünya',
        createdAt: expect.any(String),
        editedAt: null,
      });
      expect(JSON.stringify(res.body)).not.toContain(owner.user.email);
    });

    it.each([
      ['empty', { body: '' }],
      ['whitespace only', { body: '  \n\t ' }],
      ['too long', { body: 'a'.repeat(COMMENT_LIMITS.BODY_MAX + 1) }],
      ['an extra field', { body: 'x', authorId: MISSING_ID }],
      ['a missing body', {}],
      ['a non-string body', { body: 5 }],
    ])('rejects %s with 400', async (_name, body) => {
      const res = await post(body).expect(400);
      expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(await prisma.comment.count()).toBe(0);
    });

    it('accepts exactly the maximum length', async () => {
      await post({ body: 'a'.repeat(COMMENT_LIMITS.BODY_MAX) }).expect(201);
    });

    it('stores markup as plain text', async () => {
      const body = '<img src=x onerror=alert(1)>';
      const res = await post({ body }).expect(201);
      expect((res.body as CommentDto).body).toBe(body);
    });

    it('lets a plain member comment on an archived card', async () => {
      await prisma.card.update({ where: { id: cardId }, data: { archivedAt: new Date() } });
      await post({ body: 'Arşivde' }, cardId, member).expect(201);
    });

    it('answers 401 without a token', async () => {
      await http().post(`/api/v1/cards/${cardId}/comments`).send({ body: 'x' }).expect(401);
    });

    it('answers 404 to a user who is not on the board, and for a card that does not exist', async () => {
      const stranger = await createUser(app, 'Yabancı');
      expect((await post({ body: 'x' }, cardId, stranger).expect(404)).body.code).toBe(
        ErrorCode.NOT_FOUND,
      );
      await post({ body: 'x' }, MISSING_ID).expect(404);
      await post({ body: 'x' }, 'not-a-uuid').expect(404);
      expect(await prisma.comment.count()).toBe(0);
    });

    it('answers 404 for a card of another board the user owns', async () => {
      const otherBoard = await createBoard(app, member, 'Başka');
      const otherList = await createList(app, member, otherBoard);
      const otherCard = await createCard(app, member, otherList.id);

      await post({ body: 'x' }, otherCard.id, owner).expect(404);
    });
  });

  describe('counter', () => {
    it('follows creates and deletes and shows on the board page', async () => {
      const first = await addComment('bir');
      await addComment('iki', member);
      expect(await commentCountOnBoard()).toBe(2);

      await del(first.id).expect(204);
      expect(await commentCountOnBoard()).toBe(1);
      const stored = await prisma.comment.count({ where: { cardId } });
      const card = await prisma.card.findUniqueOrThrow({ where: { id: cardId } });
      expect(card.commentCount).toBe(stored);
    });

    it('is not lowered twice when one comment is deleted twice at once', async () => {
      await addComment('kalacak');
      const doomed = await addComment('silinecek');

      const results = await Promise.all([del(doomed.id), del(doomed.id)]);

      expect(results.map((res) => res.status).sort()).toEqual([204, 404]);
      expect(await commentCountOnBoard()).toBe(1);
    });

    it('stays exact under concurrent creates', async () => {
      await Promise.all(Array.from({ length: 8 }, (_, i) => post({ body: `y${i}` }).expect(201)));

      expect(await commentCountOnBoard()).toBe(8);
      expect((await feed('?limit=50').expect(200)).body.items).toHaveLength(8);
    });
  });

  describe('edit', () => {
    it('lets the author edit and sets editedAt', async () => {
      const created = await addComment('eski', member);

      const res = await patch(created.id, { body: ' yeni ' }, member).expect(200);

      expect(res.body).toMatchObject({ id: created.id, body: 'yeni', editedAt: expect.any(String) });
      expect(res.body.createdAt).toBe(created.createdAt);
    });

    it('answers 403 to someone else, even to the owner of the board', async () => {
      const created = await addComment('benim', member);

      for (const other of [owner, admin]) {
        const res = await patch(created.id, { body: 'hack' }, other).expect(403);
        expect(res.body.code).toBe(ErrorCode.FORBIDDEN);
      }
      expect((await prisma.comment.findUniqueOrThrow({ where: { id: created.id } })).body).toBe('benim');
    });

    it('validates the body', async () => {
      const created = await addComment();
      await patch(created.id, { body: '   ' }).expect(400);
      await patch(created.id, { body: 'x'.repeat(COMMENT_LIMITS.BODY_MAX + 1) }).expect(400);
      await patch(created.id, { body: 'x', extra: 1 }).expect(400);
    });

    it('answers 404 to a stranger and for a comment that does not exist', async () => {
      const created = await addComment();
      const stranger = await createUser(app, 'Yabancı');

      await patch(created.id, { body: 'x' }, stranger).expect(404);
      await patch(MISSING_ID, { body: 'x' }).expect(404);
      await patch('not-a-uuid', { body: 'x' }).expect(404);
    });
  });

  describe('delete', () => {
    it('lets the author delete', async () => {
      const created = await addComment('benim', member);
      await del(created.id, member).expect(204);
      expect(await prisma.comment.count()).toBe(0);
    });

    it('lets an ADMIN and the OWNER delete someone else', async () => {
      const first = await addComment('bir', member);
      const second = await addComment('iki', member);

      await del(first.id, admin).expect(204);
      await del(second.id, owner).expect(204);
      expect(await commentCountOnBoard()).toBe(0);
    });

    it('answers 403 to a MEMBER who is not the author', async () => {
      const created = await addComment('sahip', owner);

      const res = await del(created.id, member).expect(403);

      expect(res.body.code).toBe(ErrorCode.FORBIDDEN);
      expect(await prisma.comment.count()).toBe(1);
      expect(await commentCountOnBoard()).toBe(1);
    });

    it('answers 404 for a comment that is already gone, to a stranger, and for a bad id', async () => {
      const created = await addComment();
      const stranger = await createUser(app, 'Yabancı');
      await del(created.id, stranger).expect(404);

      await del(created.id).expect(204);
      await del(created.id).expect(404);
      await del('not-a-uuid').expect(404);
    });
  });

  describe('feed', () => {
    it('lists comments newest first', async () => {
      const first = await addComment('bir');
      const second = await addComment('iki', member);

      const page = (await feed().expect(200)).body as CardFeedPageDto;

      expect(page.items.map((item) => item.id)).toEqual([second.id, first.id]);
      expect(page.nextCursor).toBeNull();
      expect(page.items[0]).toMatchObject({ kind: 'comment', author: { name: 'Üye' } });
    });

    it('is empty for a card without comments', async () => {
      expect((await feed().expect(200)).body).toEqual({ items: [], nextCursor: null });
    });

    it('pages 25 comments with limit=10 in three pages, without repeats or gaps', async () => {
      const created: string[] = [];
      for (let i = 0; i < 25; i += 1) created.push((await addComment(`y${i}`)).id);

      const seen: string[] = [];
      const sizes: number[] = [];
      let cursor: string | null = null;
      do {
        const query: string = `?limit=10${cursor ? `&cursor=${cursor}` : ''}`;
        const page = (await feed(query).expect(200)).body as CardFeedPageDto;
        sizes.push(page.items.length);
        seen.push(...page.items.map((item) => item.id));
        cursor = page.nextCursor;
      } while (cursor);

      expect(sizes).toEqual([10, 10, 5]);
      expect(new Set(seen).size).toBe(25);
      expect(seen).toEqual([...created].reverse());
    });

    it('gives no cursor when the rows exactly fill the limit', async () => {
      await addComment('bir');
      await addComment('iki');
      const page = (await feed('?limit=2').expect(200)).body as CardFeedPageDto;
      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).toBeNull();
    });

    it('keeps the order across pages when timestamps are equal', async () => {
      const at = new Date('2026-11-05T10:00:00.000Z');
      await prisma.comment.createMany({
        data: Array.from({ length: 7 }, (_, i) => ({
          cardId,
          boardId,
          authorId: owner.user.id,
          body: `e${i}`,
          createdAt: at,
        })),
      });
      const ordered = await prisma.comment.findMany({
        where: { cardId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true },
      });

      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const page = (await feed(`?limit=3${cursor ? `&cursor=${cursor}` : ''}`).expect(200))
          .body as CardFeedPageDto;
        seen.push(...page.items.map((item) => item.id));
        cursor = page.nextCursor;
      } while (cursor);

      expect(seen).toEqual(ordered.map((row) => row.id));
    });

    it('mixes in activity only when details=true', async () => {
      const comment = await addComment();
      const activity = await prisma.activity.create({
        data: {
          boardId,
          cardId,
          actorId: owner.user.id,
          type: 'CARD_ARCHIVED',
          data: { cardTitle: 'Kart' },
          createdAt: new Date(Date.now() + 1000),
        },
      });

      const plain = (await feed('?details=false').expect(200)).body as CardFeedPageDto;
      expect(plain.items.map((item) => item.id)).toEqual([comment.id]);

      const detailed = (await feed('?details=true').expect(200)).body as CardFeedPageDto;
      expect(detailed.items.map((item: FeedItemDto) => [item.kind, item.id])).toEqual([
        ['activity', activity.id],
        ['comment', comment.id],
      ]);
      expect(detailed.items[0]).toMatchObject({
        type: 'CARD_ARCHIVED',
        data: { cardTitle: 'Kart' },
        actor: { id: owner.user.id, name: 'Sahip' },
      });
      expect(JSON.stringify(detailed)).not.toContain(owner.user.email);
    });

    it('rejects a broken cursor, a bad limit and a bad details flag with 400', async () => {
      for (const query of [
        '?cursor=nonsense',
        '?cursor=' + Buffer.from('x|y').toString('base64url'),
        '?limit=0',
        '?limit=51',
        '?limit=abc',
        '?details=yes',
        '?offset=3',
      ]) {
        const res = await feed(query).expect(400);
        expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
      }
    });

    it('answers 404 to a stranger and for a card that does not exist', async () => {
      const stranger = await createUser(app, 'Yabancı');
      await feed('', cardId, stranger).expect(404);
      await feed('', MISSING_ID).expect(404);
    });

    it('does not show another card comments', async () => {
      const list = await createList(app, owner, boardId, 'İkinci');
      const other = await createCard(app, owner, list.id, 'Öteki');
      await post({ body: 'ötekinde' }, other.id).expect(201);
      await addComment('burada');

      const page = (await feed().expect(200)).body as CardFeedPageDto;
      expect(page.items.map((item) => (item as CommentDto).body)).toEqual(['burada']);
    });
  });

  describe('members who leave, and cascades', () => {
    it('keeps the comment of a removed member with its author, and the removed member gets 404', async () => {
      const created = await addComment('kalıcı', member);
      await http()
        .delete(`/api/v1/boards/${boardId}/members/${member.user.id}`)
        .set('Authorization', owner.auth)
        .expect(204);

      const page = (await feed().expect(200)).body as CardFeedPageDto;
      expect(page.items).toEqual([
        expect.objectContaining({ id: created.id, author: expect.objectContaining({ name: 'Üye' }) }),
      ]);
      await feed('', cardId, member).expect(404);
      await patch(created.id, { body: 'x' }, member).expect(404);
      await del(created.id, member).expect(404);
      await del(created.id, admin).expect(204);
    });

    it('deletes the comments with the card', async () => {
      await addComment();
      await addComment('iki');

      await http().delete(`/api/v1/cards/${cardId}`).set('Authorization', owner.auth).expect(204);

      expect(await prisma.comment.count()).toBe(0);
    });

    it('keeps comments when the card is archived', async () => {
      await addComment();
      await http()
        .patch(`/api/v1/cards/${cardId}`)
        .set('Authorization', owner.auth)
        .send({ archived: true })
        .expect(200);

      expect((await feed().expect(200)).body.items).toHaveLength(1);
    });
  });
});
