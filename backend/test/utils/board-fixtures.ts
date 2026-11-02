import { INestApplication } from '@nestjs/common';
import type { BoardRole, CardSummaryDto, ListDto } from '@trello/contracts';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { createUser, type TestUser } from './users.js';

export const MISSING_ID = '00000000-0000-4000-8000-000000000000';

/** Creates a board through the API and returns its id. */
export async function createBoard(
  app: INestApplication,
  as: TestUser,
  title = 'Pano',
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/boards')
    .set('Authorization', as.auth)
    .send({ title })
    .expect(201);
  return res.body.id as string;
}

export async function createList(
  app: INestApplication,
  as: TestUser,
  boardId: string,
  title = 'Liste',
): Promise<ListDto> {
  const res = await request(app.getHttpServer())
    .post(`/api/v1/boards/${boardId}/lists`)
    .set('Authorization', as.auth)
    .send({ title })
    .expect(201);
  return res.body as ListDto;
}

export async function createCard(
  app: INestApplication,
  as: TestUser,
  listId: string,
  title = 'Kart',
): Promise<CardSummaryDto> {
  const res = await request(app.getHttpServer())
    .post(`/api/v1/lists/${listId}/cards`)
    .set('Authorization', as.auth)
    .send({ title })
    .expect(201);
  return res.body as CardSummaryDto;
}

/** Creates a user and adds them to the board with `role`. */
export async function addMember(
  app: INestApplication,
  boardId: string,
  role: BoardRole,
  name = 'Üye',
): Promise<TestUser> {
  const member = await createUser(app, name);
  await app.get(PrismaService).boardMember.create({
    data: { boardId, userId: member.user.id, role },
  });
  return member;
}
