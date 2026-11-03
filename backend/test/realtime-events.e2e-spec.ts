import { INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { ModulesContainer } from '@nestjs/core';
import type {
  BoardInfoDto,
  BoardSummaryDto,
  CardChecklistCounts,
  CardSummaryDto,
  ChecklistDto,
  ChecklistItemDto,
  CreateInvitationResponse,
  LabelDto,
  ListDto,
  MemberDto,
  PositionRebalancedData,
} from '@trello/contracts';
import type { Response, Test } from 'supertest';
import { hashToken, newOpaqueToken } from '../src/common/crypto/opaque-token.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './utils/create-test-app.js';
import { resetDatabase } from './utils/database.js';
import { closeAllSockets, collectUntilSentinel, expectNext } from './utils/realtime.js';
import {
  api,
  createWorld,
  createWorldData,
  event,
  type ExpectedEvent,
  expectNoLeak,
  expectNothing,
  expectReceived,
  forbiddenStrings,
  NEW_SECRET_DESCRIPTION,
  sendSentinels,
  watch,
  type Received,
  type Watcher,
  type World,
} from './utils/realtime-world.js';

type Api = ReturnType<typeof api>;

/** What one socket must receive from a request: exactly these events, in this order. */
interface Audience {
  watcher: Watcher;
  events: ExpectedEvent[];
  /** The board named in the envelope; the world's board unless said otherwise. */
  boardId?: string;
}

/**
 * One line of the mutation table (plan 5.5). The request is sent from the first socket of
 * `actor` (A's a1 unless said otherwise). The `audience` receives exactly its events;
 * every other socket of the world receives nothing, which the sentinel proves.
 */
interface Row {
  /** The endpoint column of the plan table, with the case when one endpoint has several. */
  endpoint: string;
  actor?: 'a' | 'b' | 'd';
  /** Direct database writes before the request (they broadcast nothing). */
  arrange?: (world: World) => Promise<void>;
  act: (as: Api, world: World) => Test;
  status?: number;
  audience: (world: World, response: Response) => Audience[] | Promise<Audience[]>;
  /** Strings that must stay out of every event, besides the usual ones. */
  secrets?: (world: World, response: Response) => string[];
}

/** A row whose events go to the board room: B and A's other tab get them. */
interface BoardRow extends Omit<Row, 'audience' | 'actor' | 'secrets'> {
  events: (world: World, response: Response) => ExpectedEvent[] | Promise<ExpectedEvent[]>;
}

function viaBoardRoom(row: BoardRow): Row {
  const { events, ...rest } = row;
  return {
    ...rest,
    audience: async (world, response) => {
      const expected = await events(world, response);
      return [
        { watcher: world.b1, events: expected },
        { watcher: world.a2, events: expected },
      ];
    },
  };
}

/** Routes that change data but never broadcast, on purpose (plan 5.5, "Event üretmeyenler"). */
/** Endpoint labels of the table rows, filled in while the table is built. */
const ROWS_FOR_COVERAGE: string[] = [];

const ROUTES_WITHOUT_EVENTS = new Set([
  'POST /auth/register',
  'POST /auth/login',
  'POST /auth/refresh',
  'POST /auth/logout',
  'PATCH /users/me',
]);

const METHOD_NAMES: Partial<Record<number, string>> = {
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.DELETE]: 'DELETE',
};

function joinPath(...parts: string[]): string {
  return `/${parts.map((part) => part.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/')}`;
}

/** Every route of the app that is not a GET, as "METHOD /path" without the global prefix. */
function writingRoutes(app: INestApplication): string[] {
  const routes: string[] = [];
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype;
      if (!controller) continue;
      const base = Reflect.getMetadata(PATH_METADATA, controller) as string | string[] | undefined;
      const basePath = Array.isArray(base) ? (base[0] ?? '') : (base ?? '');
      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = (controller.prototype as Record<string, unknown>)[name];
        if (typeof handler !== 'function') continue;
        const method = METHOD_NAMES[Reflect.getMetadata(METHOD_METADATA, handler) as number];
        if (!method) continue;
        const own = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined;
        const ownPath = Array.isArray(own) ? (own[0] ?? '') : (own ?? '');
        routes.push(`${method} ${joinPath(basePath, ownPath)}`);
      }
    }
  }
  return routes.sort();
}

describe('Realtime events (e2e, socket.io)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp({ listen: true });
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  afterEach(() => {
    closeAllSockets();
  });

  describe('mutation table (plan 5.5)', () => {
    const listAndCardRows: BoardRow[] = [
      // Lists
      {
        endpoint: 'POST /boards/:boardId/lists',
        act: (as, w) => as.post(`/boards/${w.boardId}/lists`).send({ title: 'Yeni liste' }),
        status: 201,
        events: (_w, res) => [event('list:created', res.body as ListDto)],
      },
      {
        endpoint: 'PATCH /lists/:listId (rename)',
        act: (as, w) => as.patch(`/lists/${w.list1.id}`).send({ title: 'Yeni ad' }),
        events: (_w, res) => [event('list:updated', res.body as ListDto)],
      },
      {
        endpoint: 'PATCH /lists/:listId (archive)',
        act: (as, w) => as.patch(`/lists/${w.list1.id}`).send({ archived: true }),
        events: (_w, res) => [event('list:updated', res.body as ListDto)],
      },
      {
        endpoint: 'PATCH /lists/:listId (restore)',
        arrange: async (w) => {
          await prisma.list.update({ where: { id: w.list2.id }, data: { archivedAt: new Date() } });
        },
        act: (as, w) => as.patch(`/lists/${w.list2.id}`).send({ archived: false }),
        events: (_w, res) => [event('list:updated', res.body as ListDto)],
      },
      {
        endpoint: 'POST /lists/:listId/move',
        act: (as, w) => as.post(`/lists/${w.list1.id}/move`).send({ afterListId: w.list2.id }),
        events: (w, res) => [
          event('list:moved', { id: w.list1.id, position: (res.body as { position: number }).position }),
        ],
      },
      {
        endpoint: 'DELETE /lists/:listId',
        act: (as, w) => as.delete(`/lists/${w.list1.id}`),
        status: 204,
        events: (w) => [event('list:deleted', { id: w.list1.id })],
      },
      // Cards
      {
        endpoint: 'POST /lists/:listId/cards',
        act: (as, w) => as.post(`/lists/${w.list1.id}/cards`).send({ title: 'Yeni kart' }),
        status: 201,
        events: (_w, res) => [event('card:created', res.body as CardSummaryDto)],
      },
      {
        endpoint: 'PATCH /cards/:cardId (title)',
        act: (as, w) => as.patch(`/cards/${w.card1.id}`).send({ title: 'Yeni başlık' }),
        events: (_w, res) => [
          event('card:updated', { card: res.body as CardSummaryDto, descriptionChanged: false }),
        ],
      },
      {
        endpoint: 'PATCH /cards/:cardId (description)',
        act: (as, w) =>
          as.patch(`/cards/${w.card1.id}`).send({ description: NEW_SECRET_DESCRIPTION }),
        events: (_w, res) => [
          event('card:updated', { card: res.body as CardSummaryDto, descriptionChanged: true }),
        ],
      },
      {
        endpoint: 'PATCH /cards/:cardId (due date)',
        act: (as, w) =>
          as.patch(`/cards/${w.card1.id}`).send({ dueDate: '2026-12-01T09:00:00.000Z' }),
        events: (_w, res) => [
          event('card:updated', { card: res.body as CardSummaryDto, descriptionChanged: false }),
        ],
      },
      {
        endpoint: 'PATCH /cards/:cardId (complete)',
        arrange: async (w) => {
          await prisma.card.update({
            where: { id: w.card1.id },
            data: { dueDate: new Date('2026-12-01T09:00:00.000Z') },
          });
        },
        act: (as, w) => as.patch(`/cards/${w.card1.id}`).send({ dueComplete: true }),
        events: (_w, res) => [
          event('card:updated', { card: res.body as CardSummaryDto, descriptionChanged: false }),
        ],
      },
      {
        endpoint: 'PATCH /cards/:cardId (archive)',
        act: (as, w) => as.patch(`/cards/${w.card1.id}`).send({ archived: true }),
        events: (_w, res) => [
          event('card:updated', { card: res.body as CardSummaryDto, descriptionChanged: false }),
        ],
      },
      {
        endpoint: 'PATCH /cards/:cardId (restore)',
        arrange: async (w) => {
          await prisma.card.update({ where: { id: w.card1.id }, data: { archivedAt: new Date() } });
        },
        act: (as, w) => as.patch(`/cards/${w.card1.id}`).send({ archived: false }),
        events: (_w, res) => [
          event('card:updated', { card: res.body as CardSummaryDto, descriptionChanged: false }),
        ],
      },
      {
        endpoint: 'POST /cards/:cardId/move (to another list)',
        act: (as, w) => as.post(`/cards/${w.card1.id}/move`).send({ listId: w.list2.id }),
        events: (w, res) => [
          event('card:moved', {
            id: w.card1.id,
            fromListId: w.list1.id,
            toListId: w.list2.id,
            position: (res.body as { position: number }).position,
          }),
        ],
      },
      {
        endpoint: 'POST /cards/:cardId/move (inside the list)',
        act: (as, w) =>
          as.post(`/cards/${w.card1.id}/move`).send({ listId: w.list1.id, afterCardId: w.card2.id }),
        events: (w, res) => [
          event('card:moved', {
            id: w.card1.id,
            fromListId: w.list1.id,
            toListId: w.list1.id,
            position: (res.body as { position: number }).position,
          }),
        ],
      },
      {
        endpoint: 'DELETE /cards/:cardId',
        act: (as, w) => as.delete(`/cards/${w.card1.id}`),
        status: 204,
        events: (w) => [event('card:deleted', { id: w.card1.id, listId: w.list1.id })],
      },
    ];

    /** The checklist counters of a card as the database has them now. */
    async function countsOf(cardId: string): Promise<CardChecklistCounts> {
      const [checklistTotal, checklistDone] = await Promise.all([
        prisma.checklistItem.count({ where: { checklist: { cardId } } }),
        prisma.checklistItem.count({ where: { checklist: { cardId }, isCompleted: true } }),
      ]);
      return { checklistTotal, checklistDone };
    }

    const labelRows: BoardRow[] = [
      {
        endpoint: 'POST /boards/:boardId/labels',
        act: (as, w) => as.post(`/boards/${w.boardId}/labels`).send({ name: 'Acil', color: 'RED' }),
        status: 201,
        events: (_w, res) => [event('label:created', res.body as LabelDto)],
      },
      {
        endpoint: 'PATCH /labels/:labelId',
        act: (as, w) => as.patch(`/labels/${w.label.id}`).send({ name: 'Yeni ad' }),
        events: (_w, res) => [event('label:updated', res.body as LabelDto)],
      },
      {
        endpoint: 'DELETE /labels/:labelId',
        arrange: async (w) => {
          await prisma.cardLabel.create({ data: { cardId: w.card1.id, labelId: w.label.id } });
        },
        act: (as, w) => as.delete(`/labels/${w.label.id}`),
        status: 204,
        events: (w) => [event('label:deleted', { id: w.label.id })],
      },
      {
        endpoint: 'PUT /cards/:cardId/labels/:labelId (new assignment)',
        act: (as, w) => as.put(`/cards/${w.card1.id}/labels/${w.label.id}`),
        status: 204,
        events: (w) => [event('card:label-added', { cardId: w.card1.id, labelId: w.label.id })],
      },
      {
        endpoint: 'PUT /cards/:cardId/labels/:labelId (already assigned)',
        arrange: async (w) => {
          await prisma.cardLabel.create({ data: { cardId: w.card1.id, labelId: w.label.id } });
        },
        act: (as, w) => as.put(`/cards/${w.card1.id}/labels/${w.label.id}`),
        status: 204,
        events: () => [],
      },
      {
        endpoint: 'DELETE /cards/:cardId/labels/:labelId (assigned)',
        arrange: async (w) => {
          await prisma.cardLabel.create({ data: { cardId: w.card1.id, labelId: w.label.id } });
        },
        act: (as, w) => as.delete(`/cards/${w.card1.id}/labels/${w.label.id}`),
        status: 204,
        events: (w) => [event('card:label-removed', { cardId: w.card1.id, labelId: w.label.id })],
      },
      {
        endpoint: 'DELETE /cards/:cardId/labels/:labelId (not assigned)',
        act: (as, w) => as.delete(`/cards/${w.card1.id}/labels/${w.label.id}`),
        status: 204,
        events: () => [],
      },
    ];

    const checklistRows: BoardRow[] = [
      {
        endpoint: 'POST /cards/:cardId/checklists',
        act: (as, w) => as.post(`/cards/${w.card1.id}/checklists`).send({ title: 'Yeni liste' }),
        status: 201,
        events: (_w, res) => [event('checklist:created', res.body as ChecklistDto)],
      },
      {
        endpoint: 'PATCH /checklists/:checklistId',
        act: (as, w) => as.patch(`/checklists/${w.checklist1.id}`).send({ title: 'Yeni ad' }),
        events: (w) => [
          event('checklist:updated', { id: w.checklist1.id, cardId: w.card1.id, title: 'Yeni ad' }),
        ],
      },
      {
        endpoint: 'POST /checklists/:checklistId/move',
        act: (as, w) =>
          as.post(`/checklists/${w.checklist1.id}/move`).send({ afterChecklistId: w.checklist2.id }),
        events: (w, res) => [
          event('checklist:moved', {
            id: w.checklist1.id,
            cardId: w.card1.id,
            position: (res.body as { position: number }).position,
          }),
        ],
      },
      {
        endpoint: 'DELETE /checklists/:checklistId',
        act: (as, w) => as.delete(`/checklists/${w.checklist1.id}`),
        status: 204,
        events: async (w) => [
          event('checklist:deleted', {
            id: w.checklist1.id,
            cardId: w.card1.id,
            counts: await countsOf(w.card1.id),
          }),
        ],
      },
      {
        endpoint: 'POST /checklists/:checklistId/items',
        act: (as, w) =>
          as.post(`/checklists/${w.checklist1.id}/items`).send({ content: 'Yeni madde' }),
        status: 201,
        events: async (w, res) => [
          event('checklist-item:created', {
            item: res.body as ChecklistItemDto,
            cardId: w.card1.id,
            counts: await countsOf(w.card1.id),
          }),
        ],
      },
      {
        endpoint: 'PATCH /checklist-items/:itemId (complete)',
        act: (as, w) => as.patch(`/checklist-items/${w.item1.id}`).send({ isCompleted: true }),
        events: async (w, res) => [
          event('checklist-item:updated', {
            item: res.body as ChecklistItemDto,
            cardId: w.card1.id,
            counts: await countsOf(w.card1.id),
          }),
        ],
      },
      {
        endpoint: 'PATCH /checklist-items/:itemId (content)',
        act: (as, w) => as.patch(`/checklist-items/${w.item1.id}`).send({ content: 'Yeni metin' }),
        events: async (w, res) => [
          event('checklist-item:updated', {
            item: res.body as ChecklistItemDto,
            cardId: w.card1.id,
            counts: await countsOf(w.card1.id),
          }),
        ],
      },
      {
        endpoint: 'POST /checklist-items/:itemId/move',
        act: (as, w) =>
          as.post(`/checklist-items/${w.item1.id}/move`).send({ checklistId: w.checklist2.id }),
        events: (w, res) => [
          event('checklist-item:moved', {
            id: w.item1.id,
            cardId: w.card1.id,
            fromChecklistId: w.checklist1.id,
            toChecklistId: w.checklist2.id,
            position: (res.body as { position: number }).position,
          }),
        ],
      },
      {
        endpoint: 'DELETE /checklist-items/:itemId',
        act: (as, w) => as.delete(`/checklist-items/${w.item2.id}`),
        status: 204,
        events: async (w) => [
          event('checklist-item:deleted', {
            id: w.item2.id,
            checklistId: w.checklist1.id,
            cardId: w.card1.id,
            counts: await countsOf(w.card1.id),
          }),
        ],
      },
    ];

    /** An invitation or token a row creates in `arrange` and uses in `act`. */
    const state = { token: '', invitationId: '' };

    async function memberOf(world: World, userId: string): Promise<MemberDto> {
      const res = await api(app, world.a).get(`/boards/${world.boardId}/members`).expect(200);
      const member = (res.body as MemberDto[]).find((entry) => entry.userId === userId);
      if (!member) throw new Error('The user is not a member');
      return member;
    }

    /** The board as the user sees it in their board list (their own role included). */
    async function summaryFor(user: World['a'], boardId: string): Promise<BoardSummaryDto> {
      const res = await api(app, user).get('/boards').expect(200);
      const summary = (res.body as BoardSummaryDto[]).find((entry) => entry.id === boardId);
      if (!summary) throw new Error('The board is not in the list');
      return summary;
    }

    function infoOf(summary: BoardSummaryDto): BoardInfoDto {
      return {
        id: summary.id,
        title: summary.title,
        background: summary.background,
        updatedAt: summary.updatedAt,
      };
    }

    const boardRows: Row[] = [
      {
        endpoint: 'POST /boards',
        act: (as) => as.post('/boards').send({ title: 'Yeni pano' }),
        status: 201,
        audience: (world, res) => {
          const summary = res.body as BoardSummaryDto;
          return [
            {
              watcher: world.a2,
              events: [event('membership:added', summary)],
              boardId: summary.id,
            },
          ];
        },
      },
      {
        endpoint: 'PATCH /boards/:boardId',
        act: (as, w) => as.patch(`/boards/${w.boardId}`).send({ title: 'Yeni ad', background: 'green' }),
        audience: (world, res) => {
          const events = [event('board:updated', infoOf(res.body as BoardSummaryDto))];
          return [
            { watcher: world.b1, events },
            { watcher: world.a2, events },
          ];
        },
      },
      {
        endpoint: 'DELETE /boards/:boardId',
        act: (as, w) => as.delete(`/boards/${w.boardId}`),
        status: 204,
        audience: (world) => {
          const events = [event('board:deleted', { boardId: world.boardId })];
          return [
            { watcher: world.b1, events },
            { watcher: world.a2, events },
          ];
        },
      },
      {
        endpoint: 'PATCH /boards/:boardId/members/:userId',
        act: (as, w) =>
          as.patch(`/boards/${w.boardId}/members/${w.b.user.id}`).send({ role: 'ADMIN' }),
        audience: (world, res) => {
          const events = [event('member:updated', res.body as MemberDto)];
          return [
            { watcher: world.b1, events },
            { watcher: world.a2, events },
          ];
        },
      },
      {
        endpoint: 'DELETE /boards/:boardId/members/:userId (removed by the owner)',
        act: (as, w) => as.delete(`/boards/${w.boardId}/members/${w.b.user.id}`),
        status: 204,
        audience: (world) => [
          { watcher: world.a2, events: [event('member:removed', { userId: world.b.user.id })] },
          { watcher: world.b1, events: [event('membership:removed', { boardId: world.boardId })] },
        ],
      },
      {
        endpoint: 'DELETE /boards/:boardId/members/:userId (leave)',
        actor: 'b',
        act: (as, w) => as.delete(`/boards/${w.boardId}/members/${w.b.user.id}`),
        status: 204,
        audience: (world) => {
          const events = [event('member:removed', { userId: world.b.user.id })];
          return [
            { watcher: world.a1, events },
            { watcher: world.a2, events },
          ];
        },
      },
      {
        endpoint: 'POST /boards/:boardId/invitations (registered address)',
        act: (as, w) =>
          as.post(`/boards/${w.boardId}/invitations`).send({ email: w.d.user.email, role: 'MEMBER' }),
        status: 201,
        audience: async (world, res) => {
          const body = res.body as CreateInvitationResponse;
          if (body.result !== 'MEMBER_ADDED') throw new Error('Expected MEMBER_ADDED');
          const members = [event('member:added', body.member)];
          const summary = await summaryFor(world.d, world.boardId);
          expect(summary.myRole).toBe('MEMBER');
          return [
            { watcher: world.b1, events: members },
            { watcher: world.a2, events: members },
            { watcher: world.d1, events: [event('membership:added', summary)] },
            { watcher: world.d2, events: [event('membership:added', summary)] },
          ];
        },
      },
      {
        endpoint: 'POST /boards/:boardId/invitations (unregistered address)',
        act: (as, w) =>
          as.post(`/boards/${w.boardId}/invitations`).send({ email: 'kayitsiz@example.com', role: 'MEMBER' }),
        status: 201,
        audience: () => [],
        secrets: (_w, res) => {
          const body = res.body as CreateInvitationResponse;
          return body.result === 'INVITATION_CREATED'
            ? [body.inviteUrl, body.inviteUrl.slice(body.inviteUrl.lastIndexOf('/') + 1)]
            : [];
        },
      },
      {
        endpoint: 'DELETE /boards/:boardId/invitations/:invitationId',
        arrange: async (w) => {
          const invitation = await prisma.invitation.create({
            data: {
              boardId: w.boardId,
              email: 'bekleyen@example.com',
              role: 'MEMBER',
              tokenHash: hashToken(newOpaqueToken()),
              invitedById: w.a.user.id,
              expiresAt: new Date(Date.now() + 86_400_000),
            },
          });
          state.invitationId = invitation.id;
        },
        act: (as, w) => as.delete(`/boards/${w.boardId}/invitations/${state.invitationId}`),
        status: 204,
        audience: () => [],
        secrets: () => [state.invitationId],
      },
      {
        endpoint: 'POST /invitations/:token/accept',
        actor: 'd',
        arrange: async (w) => {
          state.token = newOpaqueToken();
          await prisma.invitation.create({
            data: {
              boardId: w.boardId,
              email: w.d.user.email,
              role: 'ADMIN',
              tokenHash: hashToken(state.token),
              invitedById: w.a.user.id,
              expiresAt: new Date(Date.now() + 86_400_000),
            },
          });
        },
        act: (as) => as.post(`/invitations/${state.token}/accept`).send({}),
        audience: async (world, res) => {
          expect(res.body).toEqual({ boardId: world.boardId });
          const members = [event('member:added', await memberOf(world, world.d.user.id))];
          const summary = await summaryFor(world.d, world.boardId);
          expect(summary.myRole).toBe('ADMIN');
          return [
            { watcher: world.a1, events: members },
            { watcher: world.a2, events: members },
            { watcher: world.b1, events: members },
            { watcher: world.d2, events: [event('membership:added', summary)] },
          ];
        },
        secrets: () => [state.token, hashToken(state.token)],
      },
    ];

    const ROWS: Row[] = [
      ...[...listAndCardRows, ...labelRows, ...checklistRows].map(viaBoardRoom),
      ...boardRows,
    ];

    ROWS_FOR_COVERAGE.push(...ROWS.map((row) => row.endpoint));

    it.each(ROWS.map((row) => [row.endpoint, row] as const))('%s', async (_endpoint, row) => {
      const world = await createWorld(app);
      await row.arrange?.(world);
      const actor = { a: world.a, b: world.b, d: world.d }[row.actor ?? 'a'];
      const sender = { a: world.a1, b: world.b1, d: world.d1 }[row.actor ?? 'a'];

      const response = await row.act(api(app, actor, sender.socket), world);

      expect(response.status).toBe(row.status ?? 200);
      const audience = await row.audience(world, response);
      sendSentinels(app, [world.a, world.b, world.c, world.d]);
      const received: Received[] = [];
      for (const watcher of [world.a1, world.a2, world.b1, world.c1, world.d1, world.d2]) {
        const entry = audience.find((candidate) => candidate.watcher === watcher);
        if (!entry) {
          await expectNothing(watcher);
          continue;
        }
        const context = { boardId: entry.boardId ?? world.boardId, actorId: actor.user.id };
        received.push(...(await expectReceived(watcher, entry.events, context)));
      }

      expectNoLeak(received, forbiddenStrings(world, row.secrets?.(world, response) ?? []));
    });
  });

  describe('route coverage', () => {
    it('has a table row for every route that writes, unless it is listed as event-free on purpose', () => {
      const routes = writingRoutes(app);
      // Guards against a scan that finds nothing.
      expect(routes.length).toBeGreaterThan(30);
      const covered = new Set(ROWS_FOR_COVERAGE.map((endpoint) => endpoint.split(' (')[0]));
      const missing = routes.filter(
        (route) => !covered.has(route) && !ROUTES_WITHOUT_EVENTS.has(route),
      );

      expect(missing).toEqual([]);
    });

    it('does not list a route that no longer exists', () => {
      const routes = new Set(writingRoutes(app));
      const unknown = [...ROWS_FOR_COVERAGE.map((endpoint) => endpoint.split(' (')[0]), ...ROUTES_WITHOUT_EVENTS].filter(
        (route) => !routes.has(route),
      );

      expect(unknown).toEqual([]);
    });
  });

  describe('rebalance', () => {
    it('sends the new card positions before card:moved, equal to the database', async () => {
      const world = await createWorld(app);
      await prisma.card.update({ where: { id: world.card1.id }, data: { position: 1 } });
      await prisma.card.update({ where: { id: world.card2.id }, data: { position: 1 + 1e-7 } });

      const res = await api(app, world.a, world.a1.socket)
        .post(`/cards/${world.card3.id}/move`)
        .send({ listId: world.list1.id, afterCardId: world.card1.id })
        .expect(200);

      const rows = await prisma.card.findMany({
        where: { id: { in: [world.card1.id, world.card2.id, world.card3.id] } },
        select: { id: true, position: true },
      });
      const stored = new Map(rows.map((row) => [row.id, row.position]));
      const rebalanced = await expectNext(world.b1.events, 'position:rebalanced');
      const data = rebalanced.data as Extract<PositionRebalancedData, { entity: 'card' }>;
      expect(data.entity).toBe('card');
      expect(data.listId).toBe(world.list1.id);
      expect(data.positions.map((entry) => entry.id).sort()).toEqual(
        [world.card1.id, world.card2.id].sort(),
      );
      for (const entry of data.positions) expect(entry.position).toBe(stored.get(entry.id));
      const moved = await expectNext(world.b1.events, 'card:moved');
      expect(moved.data).toEqual({
        id: world.card3.id,
        fromListId: world.list2.id,
        toListId: world.list1.id,
        position: (res.body as { position: number }).position,
      });
      expect(moved.data.position).toBe(stored.get(world.card3.id));
    });

    it('sends the new list positions before list:created', async () => {
      const world = await createWorld(app);
      await prisma.list.update({ where: { id: world.list1.id }, data: { position: 1 } });
      await prisma.list.update({ where: { id: world.list2.id }, data: { position: 1 + 1e-7 } });

      const res = await api(app, world.a, world.a1.socket)
        .post(`/boards/${world.boardId}/lists`)
        .send({ title: 'Araya', afterListId: world.list1.id })
        .expect(201);

      const rows = await prisma.list.findMany({
        where: { id: { in: [world.list1.id, world.list2.id] } },
        select: { id: true, position: true },
      });
      const stored = new Map(rows.map((row) => [row.id, row.position]));
      const rebalanced = await expectNext(world.b1.events, 'position:rebalanced');
      const data = rebalanced.data as Extract<PositionRebalancedData, { entity: 'list' }>;
      expect(data.entity).toBe('list');
      expect(data.positions).toHaveLength(2);
      for (const entry of data.positions) expect(entry.position).toBe(stored.get(entry.id));
      const created = await expectNext(world.b1.events, 'list:created');
      expect(created.data).toEqual(res.body);
    });

    it('sends the new checklist positions of the card before checklist:moved', async () => {
      const world = await createWorld(app);
      const third = await prisma.checklist.create({
        data: { cardId: world.card1.id, title: 'Liste C', position: 3072 },
      });
      await prisma.checklist.update({ where: { id: world.checklist1.id }, data: { position: 1 } });
      await prisma.checklist.update({
        where: { id: world.checklist2.id },
        data: { position: 1 + 1e-7 },
      });

      const res = await api(app, world.a, world.a1.socket)
        .post(`/checklists/${third.id}/move`)
        .send({ afterChecklistId: world.checklist1.id })
        .expect(200);

      const rows = await prisma.checklist.findMany({
        where: { id: { in: [world.checklist1.id, world.checklist2.id, third.id] } },
        select: { id: true, position: true },
      });
      const stored = new Map(rows.map((row) => [row.id, row.position]));
      const rebalanced = await expectNext(world.b1.events, 'position:rebalanced');
      const data = rebalanced.data as Extract<PositionRebalancedData, { entity: 'checklist' }>;
      expect(data.entity).toBe('checklist');
      expect(data.cardId).toBe(world.card1.id);
      expect(data.positions.map((entry) => entry.id).sort()).toEqual(
        [world.checklist1.id, world.checklist2.id].sort(),
      );
      for (const entry of data.positions) expect(entry.position).toBe(stored.get(entry.id));
      const moved = await expectNext(world.b1.events, 'checklist:moved');
      expect(moved.data).toEqual({
        id: third.id,
        cardId: world.card1.id,
        position: (res.body as { position: number }).position,
      });
      expect(moved.data.position).toBe(stored.get(third.id));
    });

    it('sends the new item positions of the target checklist before checklist-item:moved', async () => {
      const world = await createWorld(app);
      const third = await prisma.checklistItem.create({
        data: { checklistId: world.checklist2.id, content: 'Madde 3', position: 1024 },
      });
      await prisma.checklistItem.update({ where: { id: world.item1.id }, data: { position: 1 } });
      await prisma.checklistItem.update({
        where: { id: world.item2.id },
        data: { position: 1 + 1e-7 },
      });

      const res = await api(app, world.a, world.a1.socket)
        .post(`/checklist-items/${third.id}/move`)
        .send({ checklistId: world.checklist1.id, afterItemId: world.item1.id })
        .expect(200);

      const rows = await prisma.checklistItem.findMany({
        where: { id: { in: [world.item1.id, world.item2.id, third.id] } },
        select: { id: true, position: true },
      });
      const stored = new Map(rows.map((row) => [row.id, row.position]));
      const rebalanced = await expectNext(world.b1.events, 'position:rebalanced');
      const data = rebalanced.data as Extract<PositionRebalancedData, { entity: 'checklist-item' }>;
      expect(data.entity).toBe('checklist-item');
      expect(data.cardId).toBe(world.card1.id);
      expect(data.checklistId).toBe(world.checklist1.id);
      expect(data.positions.map((entry) => entry.id).sort()).toEqual(
        [world.item1.id, world.item2.id].sort(),
      );
      for (const entry of data.positions) expect(entry.position).toBe(stored.get(entry.id));
      const moved = await expectNext(world.b1.events, 'checklist-item:moved');
      expect(moved.data).toEqual({
        id: third.id,
        cardId: world.card1.id,
        fromChecklistId: world.checklist2.id,
        toChecklistId: world.checklist1.id,
        position: (res.body as { position: number }).position,
      });
      expect(moved.data.position).toBe(stored.get(third.id));
    });

    it('does not rebalance when the card goes to the end of a list', async () => {
      const world = await createWorld(app);

      await api(app, world.a, world.a1.socket)
        .post(`/cards/${world.card1.id}/move`)
        .send({ listId: world.list2.id })
        .expect(200);
      sendSentinels(app, [world.b]);

      const moved = await expectNext(world.b1.events, 'card:moved');
      expect(moved.data.toListId).toBe(world.list2.id);
      await expectNothing(world.b1);
    });
  });

  describe('checklist counters', () => {
    it('sends the counters of the database with every checklist event, in commit order', async () => {
      const world = await createWorld(app);
      const items = await Promise.all(
        Array.from({ length: 10 }, (_, index) =>
          prisma.checklistItem.create({
            data: { checklistId: world.checklist2.id, content: `Madde ${index}`, position: 1024 * (index + 1) },
            select: { id: true },
          }),
        ),
      );
      // item2 of the world is already completed.
      const doneBefore = 1;

      const responses = await Promise.all(
        items.map((item) =>
          api(app, world.a, world.a1.socket)
            .patch(`/checklist-items/${item.id}`)
            .send({ isCompleted: true }),
        ),
      );
      expect(responses.map((res) => res.status)).toEqual(Array<number>(items.length).fill(200));

      sendSentinels(app, [world.b]);
      const received = await collectUntilSentinel(world.b1.events);
      const counts = received.map(
        (entry) => (entry.envelope.data as { counts: CardChecklistCounts }).counts,
      );
      expect(received.map((entry) => entry.type)).toEqual(
        Array<string>(items.length).fill('checklist-item:updated'),
      );
      expect(counts.map((entry) => entry.checklistDone)).toEqual(
        Array.from({ length: items.length }, (_, index) => doneBefore + index + 1),
      );
      const stored = await prisma.checklistItem.count({
        where: { checklist: { cardId: world.card1.id }, isCompleted: true },
      });
      expect(counts.at(-1)?.checklistDone).toBe(stored);
      expect(counts.at(-1)?.checklistTotal).toBe(2 + items.length);
    });
  });

  describe('order', () => {
    const MOVES = 20;

    interface Placed {
      listId: string;
      position: number;
    }

    /** What a watcher does with the events: the plan's client rules for cards, reduced to the minimum. */
    function applyCardEvents(
      state: Map<string, Placed>,
      events: readonly { type: string; envelope: { data: unknown } }[],
    ): void {
      for (const { type, envelope } of events) {
        if (type === 'position:rebalanced') {
          const data = envelope.data as PositionRebalancedData;
          if (data.entity !== 'card') continue;
          for (const entry of data.positions) {
            state.set(entry.id, { listId: data.listId, position: entry.position });
          }
        } else if (type === 'card:moved') {
          const data = envelope.data as { id: string; toListId: string; position: number };
          state.set(data.id, { listId: data.toListId, position: data.position });
        }
      }
    }

    function orderOf(state: ReadonlyMap<string, Placed>, listId: string): string[] {
      return [...state.entries()]
        .filter(([, placed]) => placed.listId === listId)
        .sort(([idA, a], [idB, b]) => a.position - b.position || (idA < idB ? -1 : 1))
        .map(([id]) => id);
    }

    it.each([1, 2, 3, 4, 5])(
      'a watcher that applies the events of 20 parallel moves ends in the order of GET /boards/:id (run %i of 5)',
      async () => {
        const data = await createWorldData(app);
        const as = api(app, data.a);
        const extra: CardSummaryDto[] = [];
        for (let index = 0; index < MOVES; index += 1) {
          const res = await as.post(`/lists/${data.list1.id}/cards`).send({ title: `K${index}` }).expect(201);
          extra.push(res.body as CardSummaryDto);
        }
        const b1 = await watch(app, data.b, data.boardId);

        const snapshot = await api(app, data.b).get(`/boards/${data.boardId}`).expect(200);
        const state = new Map<string, Placed>(
          (snapshot.body.cards as CardSummaryDto[]).map((card) => [
            card.id,
            { listId: card.listId, position: card.position },
          ]),
        );

        const responses = await Promise.all(
          extra.map((card, index) =>
            index % 2 === 0
              ? as.post(`/cards/${card.id}/move`).send({ listId: data.list2.id, afterCardId: data.card3.id })
              : as.post(`/cards/${card.id}/move`).send({ listId: data.list1.id }),
          ),
        );
        expect(responses.map((res) => res.status)).toEqual(Array<number>(MOVES).fill(200));

        sendSentinels(app, [data.b]);
        const received = await collectUntilSentinel(b1.events);
        expect(received.filter((entry) => entry.type === 'card:moved')).toHaveLength(MOVES);
        applyCardEvents(state, received);

        const board = await as.get(`/boards/${data.boardId}`).expect(200);
        const cards = board.body.cards as CardSummaryDto[];
        for (const list of [data.list1, data.list2]) {
          expect(orderOf(state, list.id)).toEqual(
            cards.filter((card) => card.listId === list.id).map((card) => card.id),
          );
        }
      },
      20_000,
    );
  });
});
