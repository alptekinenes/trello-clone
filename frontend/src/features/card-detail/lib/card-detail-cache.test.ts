import type { CardDetailDto, ChecklistDto, ChecklistItemDto } from '@trello/contracts';
import { describe, expect, it } from 'vitest';
import { testCardDetail } from '../../../test/fixtures';
import {
  applyCardUpdate,
  insertAttachment,
  moveItem,
  patchChecklist,
  patchItem,
  removeAttachment,
  removeChecklist,
  removeItem,
  setLabelAssigned,
  setMemberAssigned,
  summaryOf,
  upsertChecklist,
  upsertItem,
  withCounters,
} from './card-detail-cache';

function item(id: string, checklistId: string, position: number, isCompleted = false): ChecklistItemDto {
  return { id, checklistId, content: id, isCompleted, position };
}

function list(id: string, position: number, items: ChecklistItemDto[]): ChecklistDto {
  return { id, cardId: 'card', title: id, position, items };
}

const CARD: CardDetailDto = withCounters(
  testCardDetail({
    id: 'card',
    listId: 'l',
    title: 'Kart',
    checklists: [
      list('a', 1024, [item('a1', 'a', 1024, true), item('a2', 'a', 2048)]),
      list('b', 2048, [item('b1', 'b', 1024)]),
    ],
  }),
);

const itemIds = (card: CardDetailDto, checklistId: string) =>
  card.checklists.find((checklist) => checklist.id === checklistId)?.items.map((i) => i.id);

describe('summaryOf', () => {
  it('copies the content fields of the card, with the counters and no place', () => {
    const summary = summaryOf({
      ...CARD,
      commentCount: 2,
      description: 'Metin',
      dueDate: '2026-11-05T10:00:00.000Z',
    });

    expect(summary).toEqual({
      title: 'Kart',
      dueDate: '2026-11-05T10:00:00.000Z',
      dueComplete: false,
      labelIds: [],
      hasDescription: true,
      checklistTotal: 3,
      checklistDone: 1,
      commentCount: 2,
      attachmentCount: 0,
      coverAttachmentId: null,
      completedAt: null,
      coverColor: null,
      memberIds: [],
    });
    expect(summary).not.toHaveProperty('listId');
    expect(summary).not.toHaveProperty('position');
  });

  it('has no description for null', () => {
    expect(summaryOf(CARD).hasDescription).toBe(false);
  });
});

describe('applyCardUpdate', () => {
  it('trims the description and stores a blank one as null', () => {
    expect(applyCardUpdate(CARD, { description: '  a  ' }).description).toBe('a');
    expect(applyCardUpdate(CARD, { description: '   ' }).description).toBeNull();
  });

  it('clears the completion with the due date', () => {
    const complete = { ...CARD, dueDate: '2026-11-05T10:00:00.000Z', dueComplete: true };
    expect(applyCardUpdate(complete, { dueDate: null })).toMatchObject({
      dueDate: null,
      dueComplete: false,
    });
  });

  it('ignores completion without a due date', () => {
    expect(applyCardUpdate(CARD, { dueComplete: true }).dueComplete).toBe(false);
  });
});

describe('applyCardUpdate: completion and cover', () => {
  it('marks complete with a time and keeps the first one', () => {
    const done = applyCardUpdate(CARD, { isCompleted: true });
    expect(done.completedAt).toEqual(expect.any(String));
    const again = applyCardUpdate({ ...done, completedAt: '2026-11-01T08:00:00.000Z' }, { isCompleted: true });
    expect(again.completedAt).toBe('2026-11-01T08:00:00.000Z');
  });

  it('clears the completion', () => {
    const done = { ...CARD, completedAt: '2026-11-01T08:00:00.000Z' };
    expect(applyCardUpdate(done, { isCompleted: false }).completedAt).toBeNull();
  });

  it('sets and removes the cover color', () => {
    const covered = applyCardUpdate(CARD, { coverColor: 'BLUE' });
    expect(covered.coverColor).toBe('BLUE');
    expect(applyCardUpdate(covered, { coverColor: null }).coverColor).toBeNull();
    expect(applyCardUpdate(covered, { title: 'Yeni' }).coverColor).toBe('BLUE');
  });
});

describe('setMemberAssigned', () => {
  it('adds a member once and removes them', () => {
    const added = setMemberAssigned(setMemberAssigned(CARD, 'u1', true), 'u1', true);
    expect(added.memberIds).toEqual(['u1']);
    expect(setMemberAssigned(added, 'u1', false).memberIds).toEqual([]);
  });

  it('returns the same card when nothing changes', () => {
    expect(setMemberAssigned(CARD, 'u1', false)).toBe(CARD);
  });
});

describe('setLabelAssigned', () => {
  it('adds a label once and removes it', () => {
    const added = setLabelAssigned(setLabelAssigned(CARD, 'x', true), 'x', true);
    expect(added.labelIds).toEqual(['x']);
    expect(setLabelAssigned(added, 'x', false).labelIds).toEqual([]);
  });
});

describe('checklist helpers', () => {
  it('count items and done items', () => {
    expect(CARD).toMatchObject({ checklistTotal: 3, checklistDone: 1 });
  });

  it('upsertChecklist adds in position order and replaces by id', () => {
    const added = upsertChecklist(CARD, list('c', 1500, [item('c1', 'c', 1024)]));
    expect(added.checklists.map((c) => c.id)).toEqual(['a', 'c', 'b']);
    expect(added.checklistTotal).toBe(4);
    const replaced = upsertChecklist(CARD, list('a', 1024, []));
    expect(replaced.checklists).toHaveLength(2);
    expect(replaced.checklistTotal).toBe(1);
  });

  it('patchChecklist re-sorts by the new position', () => {
    expect(patchChecklist(CARD, 'a', { position: 4096 }).checklists.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('removeChecklist drops its items from the counters', () => {
    expect(removeChecklist(CARD, 'a')).toMatchObject({ checklistTotal: 1, checklistDone: 0 });
  });

  it('upsertItem adds to its checklist in order and ignores an unknown checklist', () => {
    const added = upsertItem(CARD, item('a0', 'a', 512));
    expect(itemIds(added, 'a')).toEqual(['a0', 'a1', 'a2']);
    expect(upsertItem(CARD, item('z1', 'zzz', 1)).checklistTotal).toBe(3);
  });

  it('patchItem updates done counts', () => {
    expect(patchItem(CARD, 'a2', { isCompleted: true }).checklistDone).toBe(2);
    expect(patchItem(CARD, 'a1', { isCompleted: false }).checklistDone).toBe(0);
  });

  it('removeItem updates both counters', () => {
    expect(removeItem(CARD, 'a1')).toMatchObject({ checklistTotal: 2, checklistDone: 0 });
  });

  it('moveItem reorders inside a checklist', () => {
    const moved = moveItem(CARD, 'a2', 'a', 512);
    expect(itemIds(moved, 'a')).toEqual(['a2', 'a1']);
    expect(moved).toMatchObject({ checklistTotal: 3, checklistDone: 1 });
  });

  it('moveItem moves to another checklist and keeps the totals', () => {
    const moved = moveItem(CARD, 'a1', 'b', 1536);

    expect(itemIds(moved, 'a')).toEqual(['a2']);
    expect(itemIds(moved, 'b')).toEqual(['b1', 'a1']);
    expect(moved.checklists[1].items[1]).toMatchObject({ checklistId: 'b', position: 1536 });
    expect(moved).toMatchObject({ checklistTotal: 3, checklistDone: 1 });
  });

  it('moveItem leaves the card alone for an unknown item and does not change its input', () => {
    expect(moveItem(CARD, 'nope', 'b', 1)).toBe(CARD);
    moveItem(CARD, 'a1', 'b', 1);
    expect(itemIds(CARD, 'a')).toEqual(['a1', 'a2']);
  });
});

describe('attachment helpers', () => {
  const file = (id: string) => ({
    id,
    cardId: 'card',
    fileName: `${id}.png`,
    mimeType: 'image/png' as const,
    size: 10,
    uploader: { id: 'u', name: 'Ayşe', avatarUrl: null },
    createdAt: '2026-11-05T10:00:00.000Z',
  });

  it('insertAttachment puts the newest first and ignores a duplicate', () => {
    const one = insertAttachment(CARD, file('a'), 1);
    const two = insertAttachment(one, file('b'), 2);

    expect(two.attachments.map((a) => a.id)).toEqual(['b', 'a']);
    expect(two.attachmentCount).toBe(2);
    expect(insertAttachment(two, file('b'), 2).attachments).toHaveLength(2);
  });

  it('removeAttachment drops the file and a cover that pointed at it', () => {
    const withCover = { ...insertAttachment(CARD, file('a'), 1), coverAttachmentId: 'a' };

    const removed = removeAttachment(withCover, 'a', 0);
    expect(removed.attachments).toEqual([]);
    expect(removed.attachmentCount).toBe(0);
    expect(removed.coverAttachmentId).toBeNull();
    expect(removeAttachment(withCover, 'other', 1).coverAttachmentId).toBe('a');
  });
});
