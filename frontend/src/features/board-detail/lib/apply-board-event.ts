import type { BoardDetailDto, BoardEvent, PositionRebalancedData } from '@trello/contracts';
import {
  patchCard,
  patchList,
  removeCard,
  removeLabel,
  removeList,
  removeMember,
  upsertCard,
  upsertLabel,
  upsertList,
  upsertMember,
} from './board-cache';

export interface AppliedBoardEvent {
  detail: BoardDetailDto;
  /** The cache cannot follow this event alone (e.g. a restored list's cards); refetch the board. */
  refetch: boolean;
}

const done = (detail: BoardDetailDto): AppliedBoardEvent => ({ detail, refetch: false });
const needsRefetch = (detail: BoardDetailDto): AppliedBoardEvent => ({ detail, refetch: true });

const hasList = (detail: BoardDetailDto, listId: string) =>
  detail.lists.some((list) => list.id === listId);
const hasCard = (detail: BoardDetailDto, cardId: string) =>
  detail.cards.some((card) => card.id === cardId);

/** A list leaves the board together with its cards. */
function dropList(detail: BoardDetailDto, listId: string): BoardDetailDto {
  const { cards, ...rest } = removeList(detail, listId);
  return { ...rest, cards: cards.filter((card) => card.listId !== listId) };
}

function withLabelIds(
  detail: BoardDetailDto,
  cardId: string,
  change: (labelIds: string[]) => string[],
): BoardDetailDto {
  const card = detail.cards.find((item) => item.id === cardId);
  return card ? patchCard(detail, cardId, { labelIds: change(card.labelIds) }) : detail;
}

function applyRebalance(detail: BoardDetailDto, data: PositionRebalancedData): AppliedBoardEvent {
  switch (data.entity) {
    case 'list': {
      const positions = new Map(data.positions.map((item) => [item.id, item.position]));
      const known = detail.lists.filter((list) => positions.has(list.id));
      const next = known.reduce(
        (acc, list) => patchList(acc, list.id, { position: positions.get(list.id) ?? list.position }),
        detail,
      );
      return known.length === positions.size ? done(next) : needsRefetch(next);
    }
    case 'card': {
      const positions = new Map(data.positions.map((item) => [item.id, item.position]));
      const known = detail.cards.filter(
        (card) => card.listId === data.listId && positions.has(card.id),
      );
      const next = known.reduce(
        (acc, card) => patchCard(acc, card.id, { position: positions.get(card.id) ?? card.position }),
        detail,
      );
      return known.length === positions.size ? done(next) : needsRefetch(next);
    }
    case 'checklist':
    case 'checklist-item':
      return done(detail);
    default: {
      const unhandled: never = data;
      return unhandled;
    }
  }
}

/**
 * Applies an event from another user to the cached board. Pure and idempotent:
 * the same event twice gives the same board as once (the sender's own echo is harmless).
 */
export function applyBoardEvent(
  detail: BoardDetailDto,
  event: BoardEvent,
  myUserId: string,
): AppliedBoardEvent {
  switch (event.type) {
    case 'board:updated':
      // BoardInfoDto has no `myRole`, so the viewer's own role stays.
      return done({ ...detail, board: { ...detail.board, ...event.data } });

    case 'member:added':
    case 'member:updated': {
      const member = event.data;
      const next = upsertMember(detail, member);
      return done(
        member.userId === myUserId ? { ...next, board: { ...next.board, myRole: member.role } } : next,
      );
    }
    case 'member:removed':
      return done(removeMember(detail, event.data.userId));

    case 'list:created':
      return done(event.data.archivedAt === null ? upsertList(detail, event.data) : detail);
    case 'list:updated': {
      const list = event.data;
      if (list.archivedAt !== null) return done(dropList(detail, list.id));
      // A restored list comes back without its cards.
      return hasList(detail, list.id)
        ? done(upsertList(detail, list))
        : needsRefetch(upsertList(detail, list));
    }
    case 'list:moved':
      return hasList(detail, event.data.id)
        ? done(patchList(detail, event.data.id, { position: event.data.position }))
        : needsRefetch(detail);
    case 'list:deleted':
      return done(dropList(detail, event.data.id));

    case 'card:created': {
      const card = event.data;
      if (!hasList(detail, card.listId)) return needsRefetch(detail);
      return done(card.archivedAt === null ? upsertCard(detail, card) : detail);
    }
    case 'card:updated': {
      const { card } = event.data;
      if (card.archivedAt !== null) return done(removeCard(detail, card.id));
      return hasList(detail, card.listId) ? done(upsertCard(detail, card)) : needsRefetch(detail);
    }
    case 'card:moved': {
      const { id, toListId, position } = event.data;
      if (!hasCard(detail, id) || !hasList(detail, toListId)) return needsRefetch(detail);
      return done(patchCard(detail, id, { listId: toListId, position }));
    }
    case 'card:deleted':
      return done(removeCard(detail, event.data.id));
    case 'card:label-added': {
      const { cardId, labelId } = event.data;
      return done(
        withLabelIds(detail, cardId, (ids) => (ids.includes(labelId) ? ids : [...ids, labelId])),
      );
    }
    case 'card:label-removed': {
      const { cardId, labelId } = event.data;
      return done(withLabelIds(detail, cardId, (ids) => ids.filter((id) => id !== labelId)));
    }

    case 'label:created':
    case 'label:updated':
      return done(upsertLabel(detail, event.data));
    case 'label:deleted':
      return done(removeLabel(detail, event.data.id));

    case 'checklist:deleted':
    case 'checklist-item:created':
    case 'checklist-item:updated':
    case 'checklist-item:deleted': {
      const { cardId, counts } = event.data;
      return done(hasCard(detail, cardId) ? patchCard(detail, cardId, counts) : detail);
    }
    // Their counters do not change; the open card dialog follows them (see applyCardEvent).
    case 'checklist:created':
    case 'checklist:updated':
    case 'checklist:moved':
    case 'checklist-item:moved':
      return done(detail);

    case 'position:rebalanced':
      return applyRebalance(detail, event.data);

    default: {
      const unhandled: never = event;
      return unhandled;
    }
  }
}
