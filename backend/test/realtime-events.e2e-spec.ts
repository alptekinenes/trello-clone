import { INestApplication } from '@nestjs/common';
import type { CardSummaryDto, ListDto, PositionRebalancedData } from '@trello/contracts';
import type { Response, Test } from 'supertest';
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
  type World,
} from './utils/realtime-world.js';

type Api = ReturnType<typeof api>;

/**
 * One line of the mutation table (plan 5.5): A sends the request from socket a1.
 * B (member) and A's other tab (a2) must receive exactly `events`, in order;
 * a1 (the sender) and C (another board) must receive nothing.
 */
interface Row {
  /** The endpoint column of the plan table, with the case when one endpoint has several. */
  endpoint: string;
  /** Direct database writes before the request (they broadcast nothing). */
  arrange?: (world: World) => Promise<void>;
  act: (as: Api, world: World) => Test;
  status?: number;
  events: (world: World, response: Response) => ExpectedEvent[];
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
    const listAndCardRows: Row[] = [
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

    const ROWS: Row[] = [...listAndCardRows];

    it.each(ROWS)('$endpoint', async (row) => {
      const world = await createWorld(app);
      await row.arrange?.(world);

      const response = await row.act(api(app, world.a, world.a1.socket), world);

      expect(response.status).toBe(row.status ?? 200);
      const expected = row.events(world, response);
      sendSentinels(app, [world.a, world.b, world.c]);
      const context = { boardId: world.boardId, actorId: world.a.user.id };
      const received = [
        ...(await expectReceived(world.b1, expected, context)),
        ...(await expectReceived(world.a2, expected, context)),
      ];
      await expectNothing(world.a1);
      await expectNothing(world.c1);

      expectNoLeak(received, forbiddenStrings(world));
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
