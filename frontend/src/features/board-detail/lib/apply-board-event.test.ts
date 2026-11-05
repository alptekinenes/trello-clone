import {
  BOARD_EVENT_NAMES,
  type BoardDetailDto,
  type BoardEvent,
  type BoardEventMap,
  type BoardEventName,
  type LabelDto,
  type MemberDto,
} from '@trello/contracts';
import { describe, expect, it } from 'vitest';
import {
  BOARD_ID,
  boardDetail,
  testCard,
  testCards,
  testLists,
  testMember,
  testUser,
} from '../../../test/fixtures';
import { type AppliedBoardEvent, applyBoardEvent } from './apply-board-event';

const ME = testUser.id;
const RED: LabelDto = { id: 'label-red', boardId: BOARD_ID, name: 'Acil', color: 'RED' };
const BLUE: LabelDto = { id: 'label-blue', boardId: BOARD_ID, name: 'Plan', color: 'BLUE' };
const HELPER: MemberDto = testMember({ userId: 'u-helper', name: 'Yardımcı' });
const ITEM = { id: 'i1', checklistId: 'k1', content: 'Madde', isCompleted: true, position: 1 };
const COUNTS = { checklistTotal: 3, checklistDone: 2 };
const CARD_ID = 'list-1-card-1';
const COMMENTER = { id: 'u-helper', name: 'Yardımcı', avatarUrl: null };

function comment(cardId: string) {
  return {
    kind: 'comment',
    id: 'cm1',
    cardId,
    author: COMMENTER,
    body: 'Merhaba',
    createdAt: '2026-11-05T10:00:00.000Z',
    editedAt: null,
  } as const;
}

/** Lists list-1 and list-2; list-1 holds two cards, list-2 one. */
function base(): BoardDetailDto {
  const detail = boardDetail(
    'MEMBER',
    'Yol haritası',
    testLists('Yapılacak', 'Bitti'),
    [
      ...testCards('list-1', 'Bir', 'İki'),
      ...testCards('list-2', 'Üç'),
    ].map((card, i) =>
      i === 0
        ? { ...card, labelIds: [RED.id], memberIds: ['u-helper'], coverAttachmentId: 'att-1' }
        : card,
    ),
    [RED],
  );
  return { ...detail, members: [...detail.members, HELPER] };
}

function event<K extends BoardEventName>(type: K, data: BoardEventMap[K]): BoardEvent {
  // `type` and `data` are paired by K; TypeScript cannot see that through the union.
  return { type, data } as BoardEvent;
}

const ATTACHMENT = {
  id: 'att-1',
  cardId: CARD_ID,
  fileName: 'rapor.pdf',
  mimeType: 'application/pdf',
  size: 1200,
  uploader: { id: 'u-helper', name: 'Yardımcı', avatarUrl: null },
  createdAt: '2026-11-05T10:00:00.000Z',
} as const;

const cardIds = (detail: BoardDetailDto) => detail.cards.map((card) => card.id);
const listIds = (detail: BoardDetailDto) => detail.lists.map((list) => list.id);

interface Scenario {
  name: string;
  event: BoardEvent;
  check: (result: AppliedBoardEvent, before: BoardDetailDto) => void;
}

const [LIST_1] = testLists('Yapılacak');
const newList = { id: 'list-3', boardId: BOARD_ID, title: 'Yeni', position: 3072, archivedAt: null };
const archivedAt = '2026-11-03T10:00:00.000Z';

/** Every event name needs at least one scenario; a missing key fails to compile. */
const scenarios: Record<BoardEventName, Scenario[]> = {
  'board:updated': [
    {
      name: 'changes title and background, keeps my role',
      event: event('board:updated', {
        id: BOARD_ID,
        title: 'Yeni ad',
        background: 'purple',
        updatedAt: '2026-11-03T10:00:00.000Z',
      }),
      check: ({ detail }, before) => {
        expect(detail.board).toMatchObject({ title: 'Yeni ad', background: 'purple', myRole: 'MEMBER' });
        expect(detail.lists).toBe(before.lists);
      },
    },
  ],
  'member:added': [
    {
      name: 'adds the member in server order',
      event: event('member:added', testMember({ userId: 'u-new', name: 'Yeni', role: 'ADMIN' })),
      check: ({ detail }) => {
        expect(detail.members.map((member) => member.userId)).toEqual([
          'u-new',
          testUser.id,
          'u-helper',
        ]);
      },
    },
  ],
  'member:updated': [
    {
      name: 'changes another member role',
      event: event('member:updated', { ...HELPER, role: 'ADMIN' }),
      check: ({ detail }) => {
        expect(detail.members.find((m) => m.userId === 'u-helper')?.role).toBe('ADMIN');
        expect(detail.board.myRole).toBe('MEMBER');
      },
    },
    {
      name: 'changes my own role on the board',
      event: event('member:updated', {
        ...testMember({ userId: ME, name: testUser.name }),
        role: 'ADMIN',
      }),
      check: ({ detail }) => expect(detail.board.myRole).toBe('ADMIN'),
    },
  ],
  'member:removed': [
    {
      name: 'removes the member',
      event: event('member:removed', { userId: 'u-helper' }),
      check: ({ detail }) => expect(detail.members.map((m) => m.userId)).toEqual([ME]),
    },
    {
      name: 'takes the member off every card',
      event: event('member:removed', { userId: 'u-helper' }),
      check: ({ detail }) => expect(detail.cards.every((card) => card.memberIds.length === 0)).toBe(true),
    },
  ],
  'card:member-added': [
    {
      name: 'adds the member to the card in order',
      event: event('card:member-added', { cardId: 'list-1-card-1', userId: ME }),
      check: ({ detail }) =>
        expect(detail.cards.find((c) => c.id === 'list-1-card-1')?.memberIds).toEqual([
          'u-helper',
          ME,
        ]),
    },
    {
      name: 'is idempotent and ignores an unknown card',
      event: event('card:member-added', { cardId: 'list-1-card-1', userId: 'u-helper' }),
      check: ({ detail }, before) => expect(detail).toBe(before),
    },
    {
      name: 'ignores a card this board does not have',
      event: event('card:member-added', { cardId: 'nope', userId: ME }),
      check: ({ detail }, before) => expect(detail).toBe(before),
    },
  ],
  'card:member-removed': [
    {
      name: 'takes the member off the card',
      event: event('card:member-removed', { cardId: 'list-1-card-1', userId: 'u-helper' }),
      check: ({ detail }) =>
        expect(detail.cards.find((c) => c.id === 'list-1-card-1')?.memberIds).toEqual([]),
    },
    {
      name: 'does nothing when the member was not on the card',
      event: event('card:member-removed', { cardId: 'list-1-card-2', userId: 'u-helper' }),
      check: ({ detail }, before) => expect(detail).toBe(before),
    },
  ],
  'list:created': [
    {
      name: 'adds the list at its position',
      event: event('list:created', newList),
      check: ({ detail }) => expect(listIds(detail)).toEqual(['list-1', 'list-2', 'list-3']),
    },
    {
      name: 'ignores an archived list',
      event: event('list:created', { ...newList, archivedAt }),
      check: ({ detail }) => expect(listIds(detail)).toEqual(['list-1', 'list-2']),
    },
  ],
  'list:updated': [
    {
      name: 'renames a known list without refetching',
      event: event('list:updated', { ...LIST_1, title: 'Yapılıyor' }),
      check: ({ detail, refetch }) => {
        expect(detail.lists[0]?.title).toBe('Yapılıyor');
        expect(refetch).toBe(false);
      },
    },
    {
      name: 'drops an archived list together with its cards',
      event: event('list:updated', { ...LIST_1, archivedAt }),
      check: ({ detail, refetch }) => {
        expect(listIds(detail)).toEqual(['list-2']);
        expect(cardIds(detail)).toEqual(['list-2-card-1']);
        expect(refetch).toBe(false);
      },
    },
    {
      name: 'refetches for a restored list, whose cards are not cached',
      event: event('list:updated', newList),
      check: ({ detail, refetch }) => {
        expect(listIds(detail)).toContain('list-3');
        expect(refetch).toBe(true);
      },
    },
  ],
  'list:moved': [
    {
      name: 'moves the list',
      event: event('list:moved', { id: 'list-1', position: 4096 }),
      check: ({ detail, refetch }) => {
        expect(listIds(detail)).toEqual(['list-2', 'list-1']);
        expect(refetch).toBe(false);
      },
    },
    {
      name: 'refetches for an unknown list',
      event: event('list:moved', { id: 'list-9', position: 1 }),
      check: ({ detail, refetch }, before) => {
        expect(detail).toBe(before);
        expect(refetch).toBe(true);
      },
    },
  ],
  'list:deleted': [
    {
      name: 'removes the list and its cards',
      event: event('list:deleted', { id: 'list-2' }),
      check: ({ detail }) => {
        expect(listIds(detail)).toEqual(['list-1']);
        expect(cardIds(detail)).toEqual(['list-1-card-1', 'list-1-card-2']);
      },
    },
  ],
  'card:created': [
    {
      name: 'adds the card in its list',
      event: event('card:created', testCard({ id: 'n', listId: 'list-2', title: 'Yeni', position: 512 })),
      check: ({ detail, refetch }) => {
        expect(cardIds(detail)).toContain('n');
        expect(refetch).toBe(false);
      },
    },
    {
      name: 'refetches when its list is not cached',
      event: event('card:created', testCard({ id: 'n', listId: 'list-9', title: 'Yeni' })),
      check: ({ detail, refetch }, before) => {
        expect(detail).toBe(before);
        expect(refetch).toBe(true);
      },
    },
  ],
  'card:updated': [
    {
      name: 'replaces the summary',
      event: event('card:updated', {
        card: testCard({ id: 'list-1-card-1', listId: 'list-1', title: 'Yeni başlık', position: 1024 }),
        descriptionChanged: false,
      }),
      check: ({ detail }) => {
        const card = detail.cards.find((c) => c.id === 'list-1-card-1');
        expect(card?.title).toBe('Yeni başlık');
        expect(card?.labelIds).toEqual([]);
      },
    },
    {
      name: 'drops an archived card',
      event: event('card:updated', {
        card: testCard({ id: 'list-1-card-1', listId: 'list-1', title: 'Bir', archivedAt }),
        descriptionChanged: false,
      }),
      check: ({ detail }) => expect(cardIds(detail)).not.toContain('list-1-card-1'),
    },
    {
      name: 'puts a restored card into its list',
      event: event('card:updated', testUpdated('list-1-card-9', 'list-1')),
      check: ({ detail, refetch }) => {
        expect(cardIds(detail)).toContain('list-1-card-9');
        expect(refetch).toBe(false);
      },
    },
    {
      name: 'refetches when its list is not cached',
      event: event('card:updated', testUpdated('x', 'list-9')),
      check: ({ refetch }) => expect(refetch).toBe(true),
    },
  ],
  'card:moved': [
    {
      name: 'moves the card to another list',
      event: event('card:moved', {
        id: 'list-1-card-1',
        fromListId: 'list-1',
        toListId: 'list-2',
        position: 512,
      }),
      check: ({ detail, refetch }) => {
        expect(detail.cards.filter((c) => c.listId === 'list-2').map((c) => c.id)).toEqual([
          'list-1-card-1',
          'list-2-card-1',
        ]);
        expect(refetch).toBe(false);
      },
    },
    {
      name: 'reorders within the list',
      event: event('card:moved', {
        id: 'list-1-card-1',
        fromListId: 'list-1',
        toListId: 'list-1',
        position: 4096,
      }),
      check: ({ detail }) =>
        expect(detail.cards.filter((c) => c.listId === 'list-1').map((c) => c.id)).toEqual([
          'list-1-card-2',
          'list-1-card-1',
        ]),
    },
    {
      name: 'refetches when the card or the target list is unknown',
      event: event('card:moved', { id: 'ghost', fromListId: 'list-1', toListId: 'list-2', position: 1 }),
      check: ({ detail, refetch }, before) => {
        expect(detail).toBe(before);
        expect(refetch).toBe(true);
      },
    },
  ],
  'card:deleted': [
    {
      name: 'removes the card',
      event: event('card:deleted', { id: 'list-1-card-2', listId: 'list-1' }),
      check: ({ detail }) => expect(cardIds(detail)).not.toContain('list-1-card-2'),
    },
  ],
  'card:label-added': [
    {
      name: 'adds the label id to the card',
      event: event('card:label-added', { cardId: 'list-1-card-2', labelId: RED.id }),
      check: ({ detail }) =>
        expect(detail.cards.find((c) => c.id === 'list-1-card-2')?.labelIds).toEqual([RED.id]),
    },
    {
      name: 'ignores an unknown card',
      event: event('card:label-added', { cardId: 'ghost', labelId: RED.id }),
      check: ({ detail }, before) => expect(detail.cards).toEqual(before.cards),
    },
  ],
  'card:label-removed': [
    {
      name: 'removes the label id from the card',
      event: event('card:label-removed', { cardId: 'list-1-card-1', labelId: RED.id }),
      check: ({ detail }) =>
        expect(detail.cards.find((c) => c.id === 'list-1-card-1')?.labelIds).toEqual([]),
    },
  ],
  'label:created': [
    {
      name: 'adds the label',
      event: event('label:created', BLUE),
      check: ({ detail }) => expect(detail.labels.map((l) => l.id)).toEqual([RED.id, BLUE.id]),
    },
  ],
  'label:updated': [
    {
      name: 'replaces the label',
      event: event('label:updated', { ...RED, name: 'Çok acil' }),
      check: ({ detail }) => expect(detail.labels).toEqual([{ ...RED, name: 'Çok acil' }]),
    },
  ],
  'label:deleted': [
    {
      name: 'removes the label and clears it from the cards',
      event: event('label:deleted', { id: RED.id }),
      check: ({ detail }) => {
        expect(detail.labels).toEqual([]);
        expect(detail.cards.every((card) => card.labelIds.length === 0)).toBe(true);
      },
    },
  ],
  'checklist:created': [
    {
      name: 'leaves the board alone',
      event: event('checklist:created', { id: 'k1', cardId: 'list-1-card-1', title: 'T', position: 1, items: [] }),
      check: ({ detail }, before) => expect(detail).toBe(before),
    },
  ],
  'checklist:updated': [
    {
      name: 'leaves the board alone',
      event: event('checklist:updated', { id: 'k1', cardId: 'list-1-card-1', title: 'Yeni' }),
      check: ({ detail }, before) => expect(detail).toBe(before),
    },
  ],
  'checklist:moved': [
    {
      name: 'leaves the board alone',
      event: event('checklist:moved', { id: 'k1', cardId: 'list-1-card-1', position: 5 }),
      check: ({ detail }, before) => expect(detail).toBe(before),
    },
  ],
  'checklist:deleted': [
    {
      name: 'sets the card counters',
      event: event('checklist:deleted', { id: 'k1', cardId: 'list-1-card-1', counts: COUNTS }),
      check: ({ detail }) =>
        expect(detail.cards.find((c) => c.id === 'list-1-card-1')).toMatchObject(COUNTS),
    },
    {
      name: 'ignores a card that is not on the board',
      event: event('checklist:deleted', { id: 'k1', cardId: 'ghost', counts: COUNTS }),
      check: ({ detail }, before) => expect(detail.cards).toEqual(before.cards),
    },
  ],
  'checklist-item:created': [
    {
      name: 'sets the card counters',
      event: event('checklist-item:created', { item: ITEM, cardId: 'list-1-card-1', counts: COUNTS }),
      check: ({ detail }) =>
        expect(detail.cards.find((c) => c.id === 'list-1-card-1')).toMatchObject(COUNTS),
    },
  ],
  'checklist-item:updated': [
    {
      name: 'sets the card counters',
      event: event('checklist-item:updated', { item: ITEM, cardId: 'list-1-card-2', counts: COUNTS }),
      check: ({ detail }) =>
        expect(detail.cards.find((c) => c.id === 'list-1-card-2')).toMatchObject(COUNTS),
    },
  ],
  'checklist-item:moved': [
    {
      name: 'leaves the board alone',
      event: event('checklist-item:moved', {
        id: 'i1',
        cardId: 'list-1-card-1',
        fromChecklistId: 'k1',
        toChecklistId: 'k2',
        position: 1,
      }),
      check: ({ detail }, before) => expect(detail).toBe(before),
    },
  ],
  'checklist-item:deleted': [
    {
      name: 'sets the card counters',
      event: event('checklist-item:deleted', {
        id: 'i1',
        checklistId: 'k1',
        cardId: 'list-1-card-1',
        counts: COUNTS,
      }),
      check: ({ detail }) =>
        expect(detail.cards.find((c) => c.id === 'list-1-card-1')).toMatchObject(COUNTS),
    },
  ],
  'comment:created': [
    {
      name: 'sets the card comment count from the event',
      event: event('comment:created', { comment: comment('list-1-card-1'), commentCount: 4 }),
      check: ({ detail, refetch }) => {
        expect(detail.cards.find((c) => c.id === 'list-1-card-1')?.commentCount).toBe(4);
        expect(refetch).toBe(false);
      },
    },
    {
      name: 'is idempotent: the same count twice gives the same count',
      event: event('comment:created', { comment: comment('list-1-card-1'), commentCount: 4 }),
      check: (_result, before) => {
        const once = applyBoardEvent(
          before,
          event('comment:created', { comment: comment('list-1-card-1'), commentCount: 4 }),
          ME,
        );
        const twice = applyBoardEvent(
          once.detail,
          event('comment:created', { comment: comment('list-1-card-1'), commentCount: 4 }),
          ME,
        );
        expect(twice.detail.cards.find((c) => c.id === 'list-1-card-1')?.commentCount).toBe(4);
      },
    },
    {
      name: 'ignores a card that is not on the board',
      event: event('comment:created', { comment: comment('elsewhere'), commentCount: 1 }),
      check: ({ detail, refetch }, before) => {
        expect(detail).toBe(before);
        expect(refetch).toBe(false);
      },
    },
  ],
  'comment:updated': [
    {
      name: 'leaves the board alone',
      event: event('comment:updated', comment('list-1-card-1')),
      check: ({ detail }, before) => expect(detail).toBe(before),
    },
  ],
  'comment:deleted': [
    {
      name: 'sets the card comment count from the event',
      event: event('comment:deleted', { id: 'cm1', cardId: 'list-1-card-1', commentCount: 0 }),
      check: ({ detail }) =>
        expect(detail.cards.find((c) => c.id === 'list-1-card-1')?.commentCount).toBe(0),
    },
    {
      name: 'ignores a card that is not on the board',
      event: event('comment:deleted', { id: 'cm1', cardId: 'elsewhere', commentCount: 0 }),
      check: ({ detail }, before) => expect(detail).toBe(before),
    },
  ],
  'attachment:created': [
    {
      name: 'sets the card attachment count from the event',
      event: event('attachment:created', {
        attachment: { ...ATTACHMENT, cardId: 'list-1-card-1' },
        attachmentCount: 3,
      }),
      check: ({ detail }) =>
        expect(detail.cards.find((c) => c.id === 'list-1-card-1')?.attachmentCount).toBe(3),
    },
    {
      name: 'ignores a card that is not on the board',
      event: event('attachment:created', {
        attachment: { ...ATTACHMENT, cardId: 'elsewhere' },
        attachmentCount: 3,
      }),
      check: ({ detail }, before) => expect(detail).toBe(before),
    },
  ],
  'attachment:deleted': [
    {
      name: 'sets the count and keeps a cover that is another attachment',
      event: event('attachment:deleted', { id: 'att-9', cardId: 'list-1-card-1', attachmentCount: 1 }),
      check: ({ detail }) =>
        expect(detail.cards.find((c) => c.id === 'list-1-card-1')).toMatchObject({
          attachmentCount: 1,
        }),
    },
    {
      name: 'clears the cover when the deleted attachment was the cover',
      event: event('attachment:deleted', { id: 'att-1', cardId: 'list-1-card-1', attachmentCount: 0 }),
      check: ({ detail }) =>
        expect(detail.cards.find((c) => c.id === 'list-1-card-1')).toMatchObject({
          attachmentCount: 0,
          coverAttachmentId: null,
        }),
    },
    {
      name: 'ignores a card that is not on the board',
      event: event('attachment:deleted', { id: 'att-1', cardId: 'elsewhere', attachmentCount: 0 }),
      check: ({ detail }, before) => expect(detail).toBe(before),
    },
  ],
  'activity:created': [
    {
      name: 'leaves the board alone',
      event: event('activity:created', {
        kind: 'activity',
        id: 'ac1',
        cardId: 'list-1-card-1',
        actor: COMMENTER,
        createdAt: '2026-11-05T10:00:00.000Z',
        type: 'CARD_ARCHIVED',
        data: { cardTitle: 'Bir' },
      }),
      check: ({ detail, refetch }, before) => {
        expect(detail).toBe(before);
        expect(refetch).toBe(false);
      },
    },
  ],
  'position:rebalanced': [
    {
      name: 'rewrites list positions',
      event: event('position:rebalanced', {
        entity: 'list',
        positions: [
          { id: 'list-1', position: 3000 },
          { id: 'list-2', position: 1000 },
        ],
      }),
      check: ({ detail, refetch }) => {
        expect(listIds(detail)).toEqual(['list-2', 'list-1']);
        expect(refetch).toBe(false);
      },
    },
    {
      name: 'refetches when a listed list is not cached (an archived one)',
      event: event('position:rebalanced', {
        entity: 'list',
        positions: [
          { id: 'list-1', position: 10 },
          { id: 'list-9', position: 20 },
        ],
      }),
      check: ({ detail, refetch }) => {
        expect(detail.lists[0]?.position).toBe(10);
        expect(refetch).toBe(true);
      },
    },
    {
      name: 'rewrites card positions of that list only',
      event: event('position:rebalanced', {
        entity: 'card',
        listId: 'list-1',
        positions: [
          { id: 'list-1-card-1', position: 3000 },
          { id: 'list-1-card-2', position: 1000 },
        ],
      }),
      check: ({ detail, refetch }, before) => {
        expect(detail.cards.filter((c) => c.listId === 'list-1').map((c) => c.id)).toEqual([
          'list-1-card-2',
          'list-1-card-1',
        ]);
        expect(detail.cards.find((c) => c.id === 'list-2-card-1')).toEqual(
          before.cards.find((c) => c.id === 'list-2-card-1'),
        );
        expect(refetch).toBe(false);
      },
    },
    {
      name: 'refetches when a listed card is not cached',
      event: event('position:rebalanced', {
        entity: 'card',
        listId: 'list-1',
        positions: [{ id: 'ghost', position: 5 }],
      }),
      check: ({ refetch }) => expect(refetch).toBe(true),
    },
    {
      name: 'does not touch the board for checklists',
      event: event('position:rebalanced', {
        entity: 'checklist',
        cardId: 'list-1-card-1',
        positions: [{ id: 'k1', position: 5 }],
      }),
      check: ({ detail, refetch }, before) => {
        expect(detail).toBe(before);
        expect(refetch).toBe(false);
      },
    },
    {
      name: 'does not touch the board for checklist items',
      event: event('position:rebalanced', {
        entity: 'checklist-item',
        cardId: 'list-1-card-1',
        checklistId: 'k1',
        positions: [{ id: 'i1', position: 5 }],
      }),
      check: ({ detail }, before) => expect(detail).toBe(before),
    },
  ],
};


function testUpdated(id: string, listId: string) {
  return {
    card: testCard({ id, listId, title: 'Geri geldi', position: 9000 }),
    descriptionChanged: false,
  };
}

describe('applyBoardEvent', () => {
  it('has a scenario for every board event name', () => {
    for (const name of BOARD_EVENT_NAMES) {
      expect(scenarios[name].length, name).toBeGreaterThan(0);
    }
  });

  describe.each(BOARD_EVENT_NAMES)('%s', (name) => {
    it.each(scenarios[name].map((scenario) => [scenario.name, scenario] as const))(
      '%s',
      (_title, scenario) => {
        const before = base();
        const once = applyBoardEvent(before, scenario.event, ME);

        scenario.check(once, before);
      },
    );

    it.each(scenarios[name].map((scenario) => [scenario.name, scenario] as const))(
      'is idempotent: %s',
      (_title, scenario) => {
        const before = base();
        const once = applyBoardEvent(before, scenario.event, ME);
        const twice = applyBoardEvent(once.detail, scenario.event, ME);

        expect(twice.detail).toEqual(once.detail);
      },
    );
  });

  it('does not change the board it was given', () => {
    const before = base();
    const snapshot = structuredClone(before);

    for (const name of BOARD_EVENT_NAMES) {
      for (const scenario of scenarios[name]) applyBoardEvent(before, scenario.event, ME);
    }

    expect(before).toEqual(snapshot);
  });
});
