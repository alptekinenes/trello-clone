import type { BoardEvent, CardDetailDto, PositionRebalancedData } from '@trello/contracts';
import {
  findChecklist,
  findItem,
  moveItem,
  patchChecklist,
  patchItemPosition,
  removeChecklist,
  removeItem,
  setLabelAssigned,
  setMemberAssigned,
  upsertChecklist,
  upsertItem,
} from './card-detail-cache';

export interface AppliedCardEvent {
  card: CardDetailDto;
  /** The card no longer exists (deleted, or its list was deleted). */
  gone: boolean;
  /** The cache cannot follow this event alone (e.g. the description text); refetch the card. */
  refetch: boolean;
}

const done = (card: CardDetailDto): AppliedCardEvent => ({ card, gone: false, refetch: false });
const needsRefetch = (card: CardDetailDto): AppliedCardEvent => ({ card, gone: false, refetch: true });
const gone = (card: CardDetailDto): AppliedCardEvent => ({ card, gone: true, refetch: false });

function withoutLabel(card: CardDetailDto, labelId: string): CardDetailDto {
  return card.labelIds.includes(labelId)
    ? { ...card, labelIds: card.labelIds.filter((id) => id !== labelId) }
    : card;
}

/** Applies new positions to the ones found; reports whether a listed id was missing. */
function rebalance(card: CardDetailDto, data: PositionRebalancedData): AppliedCardEvent {
  switch (data.entity) {
    case 'checklist': {
      if (data.cardId !== card.id) return done(card);
      const known = data.positions.filter((item) => findChecklist(card, item.id));
      const next = known.reduce<CardDetailDto>(
        (acc, item) => patchChecklist(acc, item.id, { position: item.position }),
        card,
      );
      return known.length === data.positions.length ? done(next) : needsRefetch(next);
    }
    case 'checklist-item': {
      if (data.cardId !== card.id) return done(card);
      const known = data.positions.filter((item) => findItem(card, item.id));
      const next = known.reduce<CardDetailDto>(
        (acc, item) => patchItemPosition(acc, item.id, item.position),
        card,
      );
      return known.length === data.positions.length ? done(next) : needsRefetch(next);
    }
    case 'list':
    case 'card':
      return done(card);
    default: {
      const unhandled: never = data;
      return unhandled;
    }
  }
}

/**
 * Applies an event from another user to the cached card of the open dialog.
 * Pure and idempotent. Events about other cards give back the same card object.
 * The checklist counters follow from the checklists (see `withCounters`).
 */
export function applyCardEvent(card: CardDetailDto, event: BoardEvent): AppliedCardEvent {
  switch (event.type) {
    case 'card:updated': {
      const { card: summary, descriptionChanged } = event.data;
      if (summary.id !== card.id) return done(card);
      const merged: CardDetailDto = { ...card, ...summary };
      if (!descriptionChanged) return done(merged);
      // The text is never broadcast: gone when there is none, otherwise fetched.
      return summary.hasDescription
        ? needsRefetch(merged)
        : done({ ...merged, description: null });
    }
    case 'card:moved': {
      if (event.data.id !== card.id) return done(card);
      return done({ ...card, listId: event.data.toListId, position: event.data.position });
    }
    case 'card:deleted':
      return event.data.id === card.id ? gone(card) : done(card);
    case 'list:deleted':
      return event.data.id === card.listId ? gone(card) : done(card);
    case 'card:label-added': {
      const { cardId, labelId } = event.data;
      if (cardId !== card.id || card.labelIds.includes(labelId)) return done(card);
      return done(setLabelAssigned(card, labelId, true));
    }
    case 'card:label-removed':
      return event.data.cardId === card.id
        ? done(setLabelAssigned(card, event.data.labelId, false))
        : done(card);
    case 'label:deleted':
      return done(withoutLabel(card, event.data.id));
    case 'card:member-added': {
      const { cardId, userId } = event.data;
      return cardId === card.id ? done(setMemberAssigned(card, userId, true)) : done(card);
    }
    case 'card:member-removed': {
      const { cardId, userId } = event.data;
      return cardId === card.id ? done(setMemberAssigned(card, userId, false)) : done(card);
    }
    // The member left the board; the server dropped them from every card without per-card events.
    case 'member:removed':
      return done(setMemberAssigned(card, event.data.userId, false));

    case 'checklist:created':
      return event.data.cardId === card.id ? done(upsertChecklist(card, event.data)) : done(card);
    case 'checklist:updated': {
      const { id, cardId, title } = event.data;
      if (cardId !== card.id) return done(card);
      return findChecklist(card, id) ? done(patchChecklist(card, id, { title })) : needsRefetch(card);
    }
    case 'checklist:moved': {
      const { id, cardId, position } = event.data;
      if (cardId !== card.id) return done(card);
      return findChecklist(card, id) ? done(patchChecklist(card, id, { position })) : needsRefetch(card);
    }
    case 'checklist:deleted':
      return event.data.cardId === card.id ? done(removeChecklist(card, event.data.id)) : done(card);

    case 'checklist-item:created':
    case 'checklist-item:updated': {
      const { item, cardId } = event.data;
      if (cardId !== card.id) return done(card);
      // An item of a checklist this card does not have: the checklist itself is news.
      return findChecklist(card, item.checklistId) ? done(upsertItem(card, item)) : needsRefetch(card);
    }
    case 'checklist-item:moved': {
      const { id, cardId, toChecklistId, position } = event.data;
      if (cardId !== card.id) return done(card);
      return findItem(card, id) && findChecklist(card, toChecklistId)
        ? done(moveItem(card, id, toChecklistId, position))
        : needsRefetch(card);
    }
    case 'checklist-item:deleted':
      return event.data.cardId === card.id ? done(removeItem(card, event.data.id)) : done(card);

    case 'position:rebalanced':
      return rebalance(card, event.data);

    // The board's own business; the dialog shows none of it.
    case 'board:updated':
    case 'member:added':
    case 'member:updated':
    case 'list:created':
    case 'list:updated':
    case 'list:moved':
    case 'card:created':
    case 'label:created':
    case 'label:updated':
      return done(card);

    default: {
      const unhandled: never = event;
      return unhandled;
    }
  }
}
