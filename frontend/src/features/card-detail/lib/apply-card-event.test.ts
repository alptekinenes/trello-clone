import {
  BOARD_EVENT_NAMES,
  type BoardEvent,
  type BoardEventMap,
  type BoardEventName,
  type CardDetailDto,
  type ChecklistDto,
  type ChecklistItemDto,
} from '@trello/contracts';
import { describe, expect, it } from 'vitest';
import { BOARD_ID, testCard, testCardDetail, testLists, testMember } from '../../../test/fixtures';
import { type AppliedCardEvent, applyCardEvent } from './apply-card-event';

const CARD = 'card-1';
const OTHER = 'card-2';
const COUNTS = { checklistTotal: 0, checklistDone: 0 };

function comment(cardId: string) {
  return {
    kind: 'comment',
    id: 'cm1',
    cardId,
    author: { id: 'u-1', name: 'Ayşe', avatarUrl: null },
    body: 'Merhaba',
    createdAt: '2026-11-05T10:00:00.000Z',
    editedAt: null,
  } as const;
}

function attachment(cardId: string, id = 'att-1') {
  return {
    id,
    cardId,
    fileName: 'rapor.pdf',
    mimeType: 'application/pdf',
    size: 1200,
    uploader: { id: 'u-1', name: 'Ayşe', avatarUrl: null },
    createdAt: '2026-11-05T10:00:00.000Z',
  } as const;
}

function item(id: string, checklistId: string, content: string, position: number, isCompleted = false) {
  return { id, checklistId, content, isCompleted, position } satisfies ChecklistItemDto;
}

function checklist(id: string, title: string, position: number, items: ChecklistItemDto[]): ChecklistDto {
  return { id, cardId: CARD, title, position, items };
}

/** Card with a description, label `red`, checklist cl-1 (two items) and an empty cl-2. */
function base(): CardDetailDto {
  const card = testCardDetail({
    id: CARD,
    listId: 'list-1',
    title: 'Rapor',
    description: 'Eski metin',
    hasDescription: true,
    labelIds: ['red'],
    memberIds: ['u-1'],
    checklists: [
      checklist('cl-1', 'Yapılacaklar', 1024, [
        item('i-1', 'cl-1', 'Taslak', 1024, true),
        item('i-2', 'cl-1', 'Gözden geçir', 2048),
      ]),
      checklist('cl-2', 'Yayın', 2048, []),
    ],
    checklistTotal: 2,
    checklistDone: 1,
    attachments: [attachment(CARD)],
    attachmentCount: 1,
    coverAttachmentId: 'att-1',
  });
  return card;
}

function event<K extends BoardEventName>(type: K, data: BoardEventMap[K]): BoardEvent {
  // `type` and `data` are paired by K; TypeScript cannot see that through the union.
  return { type, data } as BoardEvent;
}

interface Scenario {
  name: string;
  event: BoardEvent;
  check: (result: AppliedCardEvent, before: CardDetailDto) => void;
}

const sameCard = (result: AppliedCardEvent, before: CardDetailDto) => {
  expect(result.card).toBe(before);
  expect(result.gone).toBe(false);
  expect(result.refetch).toBe(false);
};

const ignored = (name: string, e: BoardEvent): Scenario => ({ name, event: e, check: sameCard });

const summary = (changes: Partial<ReturnType<typeof testCard>> = {}) =>
  testCard({ id: CARD, listId: 'list-1', title: 'Rapor', ...changes });

const itemById = (card: CardDetailDto, id: string) =>
  card.checklists.flatMap((list) => list.items).find((entry) => entry.id === id);
const titles = (card: CardDetailDto) => card.checklists.map((list) => list.title);

/** Every event name needs at least one scenario; a missing key fails to compile. */
const scenarios: Record<BoardEventName, Scenario[]> = {
  'card:updated': [
    {
      name: 'merges the summary fields',
      event: event('card:updated', {
        card: summary({ title: 'Yeni başlık', dueDate: '2026-12-01T09:00:00.000Z', labelIds: ['red', 'blue'], hasDescription: true, checklistTotal: 2, checklistDone: 1 }),
        descriptionChanged: false,
      }),
      check: ({ card, refetch }) => {
        expect(card).toMatchObject({
          title: 'Yeni başlık',
          dueDate: '2026-12-01T09:00:00.000Z',
          labelIds: ['red', 'blue'],
          description: 'Eski metin',
        });
        expect(card.checklists).toHaveLength(2);
        expect(refetch).toBe(false);
      },
    },
    {
      name: 'follows an archive',
      event: event('card:updated', {
        card: summary({ archivedAt: '2026-11-03T10:00:00.000Z', hasDescription: true }),
        descriptionChanged: false,
      }),
      check: ({ card }) => expect(card.archivedAt).toBe('2026-11-03T10:00:00.000Z'),
    },
    {
      name: 'clears the description when it was emptied',
      event: event('card:updated', { card: summary({ hasDescription: false }), descriptionChanged: true }),
      check: ({ card, refetch }) => {
        expect(card.description).toBeNull();
        expect(card.hasDescription).toBe(false);
        expect(refetch).toBe(false);
      },
    },
    {
      name: 'asks for a refetch when the description changed and there is a text',
      event: event('card:updated', { card: summary({ hasDescription: true }), descriptionChanged: true }),
      check: ({ card, refetch }) => {
        // The old text stays until the fresh one arrives.
        expect(card.description).toBe('Eski metin');
        expect(refetch).toBe(true);
      },
    },
    ignored('ignores another card', event('card:updated', { card: testCard({ id: OTHER, listId: 'list-1', title: 'X' }), descriptionChanged: true })),
  ],
  'card:moved': [
    {
      name: 'follows the move',
      event: event('card:moved', { id: CARD, fromListId: 'list-1', toListId: 'list-2', position: 512 }),
      check: ({ card }) => expect(card).toMatchObject({ listId: 'list-2', position: 512 }),
    },
    ignored('ignores another card', event('card:moved', { id: OTHER, fromListId: 'list-1', toListId: 'list-2', position: 1 })),
  ],
  'card:deleted': [
    {
      name: 'reports the card as gone',
      event: event('card:deleted', { id: CARD, listId: 'list-1' }),
      check: ({ gone, card }, before) => {
        expect(gone).toBe(true);
        expect(card).toBe(before);
      },
    },
    ignored('ignores another card', event('card:deleted', { id: OTHER, listId: 'list-1' })),
  ],
  'list:deleted': [
    {
      name: 'reports the card as gone when its list was deleted',
      event: event('list:deleted', { id: 'list-1' }),
      check: ({ gone }) => expect(gone).toBe(true),
    },
    ignored('ignores another list', event('list:deleted', { id: 'list-9' })),
  ],
  'card:label-added': [
    {
      name: 'adds the label',
      event: event('card:label-added', { cardId: CARD, labelId: 'blue' }),
      check: ({ card }) => expect(card.labelIds).toEqual(['red', 'blue']),
    },
    ignored('keeps a label already there in place', event('card:label-added', { cardId: CARD, labelId: 'red' })),
    ignored('ignores another card', event('card:label-added', { cardId: OTHER, labelId: 'blue' })),
  ],
  'card:label-removed': [
    {
      name: 'removes the label',
      event: event('card:label-removed', { cardId: CARD, labelId: 'red' }),
      check: ({ card }) => expect(card.labelIds).toEqual([]),
    },
    ignored('ignores another card', event('card:label-removed', { cardId: OTHER, labelId: 'red' })),
  ],
  'label:deleted': [
    {
      name: 'drops the label from the card',
      event: event('label:deleted', { id: 'red' }),
      check: ({ card }) => expect(card.labelIds).toEqual([]),
    },
    ignored('ignores a label the card does not have', event('label:deleted', { id: 'green' })),
  ],
  'checklist:created': [
    {
      name: 'adds the checklist at its position',
      event: event('checklist:created', checklist('cl-3', 'Yeni', 512, [])),
      check: ({ card }) => expect(titles(card)).toEqual(['Yeni', 'Yapılacaklar', 'Yayın']),
    },
    ignored('ignores a checklist of another card', event('checklist:created', { ...checklist('cl-9', 'X', 1, []), cardId: OTHER })),
  ],
  'checklist:updated': [
    {
      name: 'renames the checklist',
      event: event('checklist:updated', { id: 'cl-1', cardId: CARD, title: 'Yeni ad' }),
      check: ({ card }) => expect(titles(card)).toEqual(['Yeni ad', 'Yayın']),
    },
    {
      name: 'refetches for an unknown checklist',
      event: event('checklist:updated', { id: 'cl-9', cardId: CARD, title: 'X' }),
      check: ({ refetch }) => expect(refetch).toBe(true),
    },
    ignored('ignores another card', event('checklist:updated', { id: 'cl-1', cardId: OTHER, title: 'X' })),
  ],
  'checklist:moved': [
    {
      name: 'reorders the checklists',
      event: event('checklist:moved', { id: 'cl-1', cardId: CARD, position: 4096 }),
      check: ({ card }) => expect(titles(card)).toEqual(['Yayın', 'Yapılacaklar']),
    },
    {
      name: 'refetches for an unknown checklist',
      event: event('checklist:moved', { id: 'cl-9', cardId: CARD, position: 1 }),
      check: ({ refetch }) => expect(refetch).toBe(true),
    },
  ],
  'checklist:deleted': [
    {
      name: 'removes the checklist and recounts',
      event: event('checklist:deleted', { id: 'cl-1', cardId: CARD, counts: COUNTS }),
      check: ({ card }) => {
        expect(titles(card)).toEqual(['Yayın']);
        expect(card).toMatchObject({ checklistTotal: 0, checklistDone: 0 });
      },
    },
    ignored('ignores another card', event('checklist:deleted', { id: 'cl-1', cardId: OTHER, counts: COUNTS })),
  ],
  'checklist-item:created': [
    {
      name: 'adds the item and recounts',
      event: event('checklist-item:created', { item: item('i-3', 'cl-2', 'Yeni', 1024), cardId: CARD, counts: COUNTS }),
      check: ({ card }) => {
        expect(itemById(card, 'i-3')?.checklistId).toBe('cl-2');
        expect(card.checklistTotal).toBe(3);
      },
    },
    {
      name: 'refetches when its checklist is not in the card',
      event: event('checklist-item:created', { item: item('i-3', 'cl-9', 'Yeni', 1), cardId: CARD, counts: COUNTS }),
      check: ({ refetch }) => expect(refetch).toBe(true),
    },
    ignored('ignores another card', event('checklist-item:created', { item: item('i-3', 'cl-2', 'Yeni', 1), cardId: OTHER, counts: COUNTS })),
  ],
  'checklist-item:updated': [
    {
      name: 'ticks the item and recounts',
      event: event('checklist-item:updated', { item: item('i-2', 'cl-1', 'Gözden geçir', 2048, true), cardId: CARD, counts: COUNTS }),
      check: ({ card }) => {
        expect(itemById(card, 'i-2')?.isCompleted).toBe(true);
        expect(card.checklistDone).toBe(2);
      },
    },
    {
      name: 'edits the text',
      event: event('checklist-item:updated', { item: item('i-1', 'cl-1', 'Yeni metin', 1024, true), cardId: CARD, counts: COUNTS }),
      check: ({ card }) => expect(itemById(card, 'i-1')?.content).toBe('Yeni metin'),
    },
  ],
  'checklist-item:moved': [
    {
      name: 'moves the item to another checklist',
      event: event('checklist-item:moved', { id: 'i-1', cardId: CARD, fromChecklistId: 'cl-1', toChecklistId: 'cl-2', position: 512 }),
      check: ({ card }) => {
        expect(card.checklists.find((c) => c.id === 'cl-2')?.items.map((i) => i.id)).toEqual(['i-1']);
        expect(card.checklists.find((c) => c.id === 'cl-1')?.items.map((i) => i.id)).toEqual(['i-2']);
      },
    },
    {
      name: 'reorders within the checklist',
      event: event('checklist-item:moved', { id: 'i-1', cardId: CARD, fromChecklistId: 'cl-1', toChecklistId: 'cl-1', position: 4096 }),
      check: ({ card }) =>
        expect(card.checklists[0]?.items.map((i) => i.id)).toEqual(['i-2', 'i-1']),
    },
    {
      name: 'refetches when the item is unknown',
      event: event('checklist-item:moved', { id: 'i-9', cardId: CARD, fromChecklistId: 'cl-1', toChecklistId: 'cl-2', position: 1 }),
      check: ({ refetch }) => expect(refetch).toBe(true),
    },
  ],
  'checklist-item:deleted': [
    {
      name: 'removes the item and recounts',
      event: event('checklist-item:deleted', { id: 'i-1', checklistId: 'cl-1', cardId: CARD, counts: COUNTS }),
      check: ({ card }) => {
        expect(itemById(card, 'i-1')).toBeUndefined();
        expect(card).toMatchObject({ checklistTotal: 1, checklistDone: 0 });
      },
    },
    ignored('ignores another card', event('checklist-item:deleted', { id: 'i-1', checklistId: 'cl-1', cardId: OTHER, counts: COUNTS })),
  ],
  'position:rebalanced': [
    {
      name: 'rewrites checklist positions',
      event: event('position:rebalanced', { entity: 'checklist', cardId: CARD, positions: [{ id: 'cl-1', position: 9000 }, { id: 'cl-2', position: 1000 }] }),
      check: ({ card, refetch }) => {
        expect(titles(card)).toEqual(['Yayın', 'Yapılacaklar']);
        expect(refetch).toBe(false);
      },
    },
    {
      name: 'rewrites item positions of the checklist',
      event: event('position:rebalanced', { entity: 'checklist-item', cardId: CARD, checklistId: 'cl-1', positions: [{ id: 'i-1', position: 9000 }, { id: 'i-2', position: 1000 }] }),
      check: ({ card }) => expect(card.checklists[0]?.items.map((i) => i.id)).toEqual(['i-2', 'i-1']),
    },
    {
      name: 'refetches when a listed id is not in the card',
      event: event('position:rebalanced', { entity: 'checklist-item', cardId: CARD, checklistId: 'cl-1', positions: [{ id: 'i-9', position: 1 }] }),
      check: ({ refetch }) => expect(refetch).toBe(true),
    },
    ignored('ignores the checklists of another card', event('position:rebalanced', { entity: 'checklist', cardId: OTHER, positions: [{ id: 'cl-1', position: 5 }] })),
    ignored('ignores board-level rebalances', event('position:rebalanced', { entity: 'card', listId: 'list-1', positions: [{ id: CARD, position: 5 }] })),
    ignored('ignores list rebalances', event('position:rebalanced', { entity: 'list', positions: [{ id: 'list-1', position: 5 }] })),
  ],
  'comment:created': [
    {
      name: 'sets the comment count from the event',
      event: event('comment:created', { comment: comment(CARD), commentCount: 3 }),
      check: ({ card, gone, refetch }) => {
        expect(card.commentCount).toBe(3);
        expect(gone).toBe(false);
        expect(refetch).toBe(false);
      },
    },
    ignored('ignores another card', event('comment:created', { comment: comment(OTHER), commentCount: 3 })),
  ],
  'comment:updated': [
    ignored('leaves the card to the feed', event('comment:updated', comment(CARD))),
  ],
  'comment:deleted': [
    {
      name: 'sets the comment count from the event',
      event: event('comment:deleted', { id: 'cm1', cardId: CARD, commentCount: 1 }),
      check: ({ card }) => expect(card.commentCount).toBe(1),
    },
    ignored('ignores another card', event('comment:deleted', { id: 'cm1', cardId: OTHER, commentCount: 1 })),
  ],
  'attachment:created': [
    {
      name: 'adds the attachment first and sets the count',
      event: event('attachment:created', { attachment: attachment(CARD, 'att-2'), attachmentCount: 2 }),
      check: ({ card }) => {
        expect(card.attachments.map((a) => a.id)).toEqual(['att-2', 'att-1']);
        expect(card.attachmentCount).toBe(2);
      },
    },
    {
      name: 'does not add an attachment the card already has',
      event: event('attachment:created', { attachment: attachment(CARD, 'att-1'), attachmentCount: 1 }),
      check: ({ card }) => {
        expect(card.attachments.map((a) => a.id)).toEqual(['att-1']);
        expect(card.attachmentCount).toBe(1);
      },
    },
    ignored(
      'ignores another card',
      event('attachment:created', { attachment: attachment(OTHER), attachmentCount: 5 }),
    ),
  ],
  'attachment:deleted': [
    {
      name: 'removes the attachment, sets the count and clears its cover',
      event: event('attachment:deleted', { id: 'att-1', cardId: CARD, attachmentCount: 0 }),
      check: ({ card }) => {
        expect(card.attachments).toEqual([]);
        expect(card.attachmentCount).toBe(0);
        expect(card.coverAttachmentId).toBeNull();
      },
    },
    ignored('ignores another card', event('attachment:deleted', { id: 'att-1', cardId: OTHER, attachmentCount: 0 })),
  ],
  'activity:created': [
    ignored(
      'leaves the card to the feed',
      event('activity:created', {
        kind: 'activity',
        id: 'ac1',
        cardId: CARD,
        actor: { id: 'u-1', name: 'Ayşe', avatarUrl: null },
        createdAt: '2026-11-05T10:00:00.000Z',
        type: 'CARD_COMPLETED',
        data: { cardTitle: 'Rapor' },
      }),
    ),
  ],
  'board:updated': [
    ignored('is the board’s business', event('board:updated', { id: BOARD_ID, title: 'X', background: 'green', updatedAt: '' })),
  ],
  'member:added': [ignored('is the board’s business', event('member:added', testMember({ userId: 'u', name: 'U' })))],
  'member:updated': [ignored('is the board’s business', event('member:updated', testMember({ userId: 'u', name: 'U' })))],
  'member:removed': [
    {
      name: 'drops the member from the card',
      event: event('member:removed', { userId: 'u-1' }),
      check: ({ card }) => expect(card.memberIds).toEqual([]),
    },
    ignored('ignores a member who is not on the card', event('member:removed', { userId: 'u' })),
  ],
  'card:member-added': [
    {
      name: 'adds the member',
      event: event('card:member-added', { cardId: CARD, userId: 'u-2' }),
      check: ({ card }) => expect(card.memberIds).toEqual(['u-1', 'u-2']),
    },
    ignored('is idempotent', event('card:member-added', { cardId: CARD, userId: 'u-1' })),
    ignored('ignores another card', event('card:member-added', { cardId: OTHER, userId: 'u-2' })),
  ],
  'card:member-removed': [
    {
      name: 'removes the member',
      event: event('card:member-removed', { cardId: CARD, userId: 'u-1' }),
      check: ({ card }) => expect(card.memberIds).toEqual([]),
    },
    ignored('ignores another card', event('card:member-removed', { cardId: OTHER, userId: 'u-1' })),
  ],
  'list:created': [ignored('is the board’s business', event('list:created', testLists('Yeni')[0]))],
  'list:updated': [ignored('is the board’s business', event('list:updated', testLists('Yeni')[0]))],
  'list:moved': [ignored('is the board’s business', event('list:moved', { id: 'list-1', position: 5 }))],
  'card:created': [ignored('is the board’s business', event('card:created', testCard({ id: OTHER, listId: 'list-1', title: 'Y' })))],
  'label:created': [ignored('is the board’s business', event('label:created', { id: 'l', boardId: BOARD_ID, name: 'L', color: 'RED' }))],
  'label:updated': [ignored('is the board’s business', event('label:updated', { id: 'l', boardId: BOARD_ID, name: 'L', color: 'RED' }))],
};

describe('applyCardEvent', () => {
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
        scenario.check(applyCardEvent(before, scenario.event), before);
      },
    );

    it.each(scenarios[name].map((scenario) => [scenario.name, scenario] as const))(
      'is idempotent: %s',
      (_title, scenario) => {
        const once = applyCardEvent(base(), scenario.event);
        const twice = applyCardEvent(once.card, scenario.event);

        expect(twice.card).toEqual(once.card);
        expect(twice.gone).toBe(once.gone);
      },
    );
  });

  it('does not change the card it was given', () => {
    const before = base();
    const snapshot = structuredClone(before);

    for (const name of BOARD_EVENT_NAMES) {
      for (const scenario of scenarios[name]) applyCardEvent(before, scenario.event);
    }

    expect(before).toEqual(snapshot);
  });
});
