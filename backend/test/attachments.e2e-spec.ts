import { INestApplication } from '@nestjs/common';
import {
  ATTACHMENT_LIMITS,
  type AttachmentCreatedDto,
  type BoardDetailDto,
  type CardDetailDto,
  ErrorCode,
  type FeedItemDto,
  type CardFeedPageDto,
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
import {
  HTML_AS_PNG,
  MZ_EXECUTABLE,
  PDF_MINIMAL,
  PNG_1X1,
  SVG_IMAGE,
  textOfSize,
} from './utils/files.js';
import { resetUploads, storedFiles } from './utils/uploads.js';
import { createUser, type TestUser } from './utils/users.js';

const KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('Card attachments (e2e, database, disk)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: TestUser;
  let admin: TestUser;
  let member: TestUser;
  let other: TestUser;
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
    await resetUploads();
    owner = await createUser(app, 'Sahip');
    boardId = await createBoard(app, owner);
    admin = await addMember(app, boardId, 'ADMIN', 'Yönetici');
    member = await addMember(app, boardId, 'MEMBER', 'Üye');
    other = await createUser(app, 'Yabancı');
    const list = await createList(app, owner, boardId);
    cardId = (await createCard(app, owner, list.id)).id;
  });

  const upload = (
    file: Buffer,
    filename: string,
    { card = cardId, as = owner, field = 'file' } = {},
  ) =>
    http()
      .post(`/api/v1/cards/${card}/attachments`)
      .set('Authorization', as.auth)
      .attach(field, file, { filename });
  const del = (id: string, as = owner) =>
    http().delete(`/api/v1/attachments/${id}`).set('Authorization', as.auth);

  async function addAttachment(as = owner, name = 'logo.png'): Promise<AttachmentCreatedDto> {
    return (await upload(PNG_1X1, name, { as }).expect(201)).body as AttachmentCreatedDto;
  }

  async function detail(as = owner): Promise<CardDetailDto> {
    const res = await http()
      .get(`/api/v1/cards/${cardId}`)
      .set('Authorization', as.auth)
      .expect(200);
    return res.body as CardDetailDto;
  }

  describe('upload', () => {
    it('stores a PNG under a server-made key and keeps the Turkish display name', async () => {
      const res = await upload(PNG_1X1, 'Şirket logosu.png').expect(201);

      expect(res.body).toEqual({
        attachment: {
          id: expect.any(String),
          cardId,
          fileName: 'Şirket logosu.png',
          mimeType: 'image/png',
          size: PNG_1X1.length,
          uploader: { id: owner.user.id, name: 'Sahip', avatarUrl: null },
          createdAt: expect.any(String),
        },
        attachmentCount: 1,
      } satisfies AttachmentCreatedDto);
      expect(JSON.stringify(res.body)).not.toContain('storageKey');
      expect(JSON.stringify(res.body)).not.toContain(owner.user.email);

      const row = await prisma.attachment.findFirstOrThrow({ where: { cardId } });
      expect(row.storageKey).toMatch(KEY_PATTERN);
      expect(row.boardId).toBe(boardId);
      expect(await storedFiles()).toEqual([row.storageKey]);
    });

    it('shows the attachment in the card detail (newest first) and the count on the board', async () => {
      const first = await addAttachment(owner, 'bir.png');
      const second = await addAttachment(member, 'iki.png');

      const card = await detail();
      expect(card.attachmentCount).toBe(2);
      expect(card.attachments.map((a) => a.id)).toEqual([
        second.attachment.id,
        first.attachment.id,
      ]);
      expect(card.attachments[0].uploader.name).toBe('Üye');
      expect(JSON.stringify(card)).not.toContain('storageKey');

      const board = await http()
        .get(`/api/v1/boards/${boardId}`)
        .set('Authorization', owner.auth)
        .expect(200);
      expect((board.body as BoardDetailDto).cards[0]).toMatchObject({
        attachmentCount: 2,
        coverAttachmentId: null,
      });
    });

    it('detects the type from the content and accepts UTF-8 text', async () => {
      const pdf = await upload(PDF_MINIMAL, 'rapor.bin').expect(201);
      expect((pdf.body as AttachmentCreatedDto).attachment.mimeType).toBe('application/pdf');
      const text = await upload(Buffer.from('Merhaba dünya'), 'not.txt').expect(201);
      expect((text.body as AttachmentCreatedDto).attachment.mimeType).toBe('text/plain');
    });

    it('sanitizes the display name', async () => {
      const res = await upload(PNG_1X1, '..\\..\\etc\\pass‮wd.png').expect(201);
      expect((res.body as AttachmentCreatedDto).attachment.fileName).toBe('passwd.png');
      const files = await storedFiles();
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(KEY_PATTERN);
    });

    it.each([
      ['HTML named .png', HTML_AS_PNG, 'a.png'],
      ['an executable named .pdf', MZ_EXECUTABLE, 'a.pdf'],
      ['SVG', SVG_IMAGE, 'a.svg'],
      ['text with NUL named .txt', Buffer.from('a\u0000b'), 'a.txt'],
    ])('answers 415 for %s and stores nothing', async (_label, file, name) => {
      const res = await upload(file, name).expect(415);

      expect(res.body.code).toBe(ErrorCode.UNSUPPORTED_FILE_TYPE);
      expect(await storedFiles()).toEqual([]);
      expect(await prisma.attachment.count()).toBe(0);
      expect((await detail()).attachmentCount).toBe(0);
    });

    it('answers 415 when the claimed Content-Type is an image but the bytes are HTML', async () => {
      const res = await http()
        .post(`/api/v1/cards/${cardId}/attachments`)
        .set('Authorization', owner.auth)
        .attach('file', HTML_AS_PNG, { filename: 'a.png', contentType: 'image/png' })
        .expect(415);
      expect(res.body.code).toBe(ErrorCode.UNSUPPORTED_FILE_TYPE);
    });

    it('answers 400 for an empty file, no file, two files, another field name and extra text', async () => {
      await upload(Buffer.alloc(0), 'empty.txt').expect(400);
      await http()
        .post(`/api/v1/cards/${cardId}/attachments`)
        .set('Authorization', owner.auth)
        .send({})
        .expect(400);
      await http()
        .post(`/api/v1/cards/${cardId}/attachments`)
        .set('Authorization', owner.auth)
        .attach('file', PNG_1X1, { filename: 'a.png' })
        .attach('file', PNG_1X1, { filename: 'b.png' })
        .expect(400);
      await upload(PNG_1X1, 'a.png', { field: 'document' }).expect(400);
      await http()
        .post(`/api/v1/cards/${cardId}/attachments`)
        .set('Authorization', owner.auth)
        .field('note', 'x')
        .attach('file', PNG_1X1, { filename: 'a.png' })
        .expect(400);

      expect(await storedFiles()).toEqual([]);
      expect(await prisma.attachment.count()).toBe(0);
    });

    it('accepts exactly 10 MB and answers 413 above it, leaving no file behind', async () => {
      const ok = await upload(textOfSize(ATTACHMENT_LIMITS.MAX_BYTES), 'buyuk.txt').expect(201);
      expect((ok.body as AttachmentCreatedDto).attachment.size).toBe(ATTACHMENT_LIMITS.MAX_BYTES);
      await del((ok.body as AttachmentCreatedDto).attachment.id).expect(204);
      expect(await storedFiles()).toEqual([]);

      const tooBig = await upload(textOfSize(ATTACHMENT_LIMITS.MAX_BYTES + 1), 'cok.txt').expect(
        413,
      );
      expect(tooBig.body.code).toBe(ErrorCode.PAYLOAD_TOO_LARGE);
      expect(await storedFiles()).toEqual([]);
      expect(await prisma.attachment.count()).toBe(0);
    });

    it('allows 20 attachments, answers 409 for the 21st and allows one again after a delete', async () => {
      const created: AttachmentCreatedDto[] = [];
      for (let i = 0; i < ATTACHMENT_LIMITS.MAX_PER_CARD; i += 1) {
        created.push(await addAttachment(owner, `dosya-${i}.png`));
      }
      expect(created.at(-1)?.attachmentCount).toBe(20);

      const res = await upload(PNG_1X1, 'yirmibir.png').expect(409);
      expect(res.body.code).toBe(ErrorCode.ATTACHMENT_LIMIT_REACHED);
      expect(await storedFiles()).toHaveLength(20);

      await del(created[0].attachment.id).expect(204);
      const again = await addAttachment(owner, 'yeni.png');
      expect(again.attachmentCount).toBe(20);
    });

    it('lets two parallel uploads at the limit through only once', async () => {
      await prisma.card.update({
        where: { id: cardId },
        data: { attachmentCount: ATTACHMENT_LIMITS.MAX_PER_CARD - 1 },
      });

      const results = await Promise.all([
        upload(PNG_1X1, 'a.png'),
        upload(PNG_1X1, 'b.png'),
      ]);

      expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
      expect(await storedFiles()).toHaveLength(1);
      expect((await detail()).attachmentCount).toBe(ATTACHMENT_LIMITS.MAX_PER_CARD);
    });

    it('records the activity with a copy of the file name', async () => {
      await addAttachment(owner, 'rapor.png');

      const res = await http()
        .get(`/api/v1/cards/${cardId}/feed?details=true`)
        .set('Authorization', owner.auth)
        .expect(200);
      const items = (res.body as CardFeedPageDto).items as FeedItemDto[];
      expect(items[0]).toMatchObject({
        kind: 'activity',
        type: 'CARD_ATTACHMENT_ADDED',
        actor: { id: owner.user.id },
        data: {
          cardTitle: 'Kart',
          attachment: { id: expect.any(String), fileName: 'rapor.png' },
        },
      });
    });
  });

  describe('authorization', () => {
    it('answers 401 without a token', async () => {
      await http()
        .post(`/api/v1/cards/${cardId}/attachments`)
        .attach('file', PNG_1X1, { filename: 'a.png' })
        .expect(401);
      const created = await addAttachment();
      await http().delete(`/api/v1/attachments/${created.attachment.id}`).expect(401);
    });

    it('answers 404 to a non-member and for a missing or malformed card', async () => {
      await upload(PNG_1X1, 'a.png', { as: other }).expect(404);
      await upload(PNG_1X1, 'a.png', { card: MISSING_ID }).expect(404);
      await upload(PNG_1X1, 'a.png', { card: 'not-a-uuid' }).expect(404);
      expect(await storedFiles()).toEqual([]);
    });

    it('answers 404 when the card belongs to another board of the user', async () => {
      const foreign = await createUser(app, 'Başka');
      const foreignBoard = await createBoard(app, foreign);
      const foreignList = await createList(app, foreign, foreignBoard);
      const foreignCard = await createCard(app, foreign, foreignList.id);

      await upload(PNG_1X1, 'a.png', { card: foreignCard.id }).expect(404);
    });

    it('lets the uploader and an ADMIN delete, not another MEMBER', async () => {
      const mine = await addAttachment(member, 'benim.png');
      const stored = await storedFiles();
      expect(stored).toHaveLength(1);

      await del(mine.attachment.id, other).expect(404);
      await del(mine.attachment.id, member).expect(204);
      expect(await storedFiles()).toEqual([]);

      const second = await addAttachment(owner, 'sahip.png');
      const denied = await del(second.attachment.id, member).expect(403);
      expect(denied.body.code).toBe(ErrorCode.FORBIDDEN);
      expect(await storedFiles()).toHaveLength(1);

      const third = await addAttachment(member, 'uye.png');
      await del(third.attachment.id, admin).expect(204);
      await del(third.attachment.id, admin).expect(404);
      await del(second.attachment.id, admin).expect(204);
      expect(await storedFiles()).toEqual([]);
      expect(await prisma.attachment.count()).toBe(0);
    });

    it('answers 404 for a missing or malformed attachment id', async () => {
      await del(MISSING_ID).expect(404);
      await del('not-a-uuid').expect(404);
    });
  });

  describe('delete', () => {
    it('lowers the counter, records the activity and removes the file', async () => {
      const first = await addAttachment(owner, 'bir.png');
      await addAttachment(owner, 'iki.png');

      await del(first.attachment.id).expect(204);

      const card = await detail();
      expect(card.attachmentCount).toBe(1);
      expect(card.attachments.map((a) => a.fileName)).toEqual(['iki.png']);
      expect(await storedFiles()).toHaveLength(1);

      const res = await http()
        .get(`/api/v1/cards/${cardId}/feed?details=true`)
        .set('Authorization', owner.auth)
        .expect(200);
      expect((res.body as CardFeedPageDto).items[0]).toMatchObject({
        type: 'CARD_ATTACHMENT_REMOVED',
        data: { attachment: { id: first.attachment.id, fileName: 'bir.png' } },
      });
    });

    it('clears the card cover when the cover attachment is deleted', async () => {
      const created = await addAttachment();
      await prisma.card.update({
        where: { id: cardId },
        data: { coverAttachmentId: created.attachment.id },
      });

      await del(created.attachment.id).expect(204);

      expect((await detail()).coverAttachmentId).toBeNull();
    });

    it('deleting the card removes its attachment rows, also with a cover set', async () => {
      const created = await addAttachment();
      await prisma.card.update({
        where: { id: cardId },
        data: { coverAttachmentId: created.attachment.id },
      });

      await http().delete(`/api/v1/cards/${cardId}`).set('Authorization', owner.auth).expect(204);

      expect(await prisma.attachment.count()).toBe(0);
    });
  });
});

describe('Card attachments rate limit (e2e)', () => {
  let app: INestApplication;
  let owner: TestUser;
  let cardId: string;

  beforeAll(async () => {
    vi.stubEnv('UPLOAD_RATE_LIMIT_PER_MINUTE', '2');
    // A fresh app, so the limit counters of the other tests do not count.
    app = await createTestApp();
    await resetDatabase(app);
    await resetUploads();
    owner = await createUser(app, 'Sahip');
    const boardId = await createBoard(app, owner);
    const list = await createList(app, owner, boardId);
    cardId = (await createCard(app, owner, list.id)).id;
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it('answers 429 to the third upload within a minute', async () => {
    const send = () =>
      request(app.getHttpServer())
        .post(`/api/v1/cards/${cardId}/attachments`)
        .set('Authorization', owner.auth)
        .attach('file', PNG_1X1, { filename: 'a.png' });

    await send().expect(201);
    await send().expect(201);
    const limited = await send().expect(429);
    expect(limited.body.code).toBe(ErrorCode.TOO_MANY_REQUESTS);
  });
});
