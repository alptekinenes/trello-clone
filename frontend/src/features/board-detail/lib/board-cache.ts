import {
  type BoardDetailDto,
  type BoardRole,
  type CardSummaryDto,
  LABEL_COLORS,
  type LabelDto,
  type ListDto,
  type MemberDto,
  type PositionRebalancedData,
} from '@trello/contracts';
import { sortByPosition } from '../../../shared/lib/sort-by-position';

export function upsertList(detail: BoardDetailDto, list: ListDto): BoardDetailDto {
  const others = detail.lists.filter((item) => item.id !== list.id);
  return { ...detail, lists: sortByPosition([...others, list]) };
}

export function patchList(
  detail: BoardDetailDto,
  listId: string,
  changes: Partial<ListDto>,
): BoardDetailDto {
  return {
    ...detail,
    lists: sortByPosition(
      detail.lists.map((list) => (list.id === listId ? { ...list, ...changes } : list)),
    ),
  };
}

export function removeList(detail: BoardDetailDto, listId: string): BoardDetailDto {
  return { ...detail, lists: detail.lists.filter((list) => list.id !== listId) };
}

export function upsertCard(detail: BoardDetailDto, card: CardSummaryDto): BoardDetailDto {
  const others = detail.cards.filter((item) => item.id !== card.id);
  return { ...detail, cards: sortByPosition([...others, card]) };
}

export function patchCard(
  detail: BoardDetailDto,
  cardId: string,
  changes: Partial<CardSummaryDto>,
): BoardDetailDto {
  return {
    ...detail,
    cards: sortByPosition(
      detail.cards.map((card) => (card.id === cardId ? { ...card, ...changes } : card)),
    ),
  };
}

export function removeCard(detail: BoardDetailDto, cardId: string): BoardDetailDto {
  return { ...detail, cards: detail.cards.filter((card) => card.id !== cardId) };
}

export interface AppliedPositions {
  detail: BoardDetailDto;
  /** The cache cannot follow alone (an id is unknown here); refetch the board. */
  refetch: boolean;
}

/**
 * Gives the siblings their respread positions from a `position:rebalanced` event or from a move
 * response. Pure and idempotent: applying the same data twice gives the same board.
 */
export function applyRebalance(detail: BoardDetailDto, data: PositionRebalancedData): AppliedPositions {
  switch (data.entity) {
    case 'list': {
      const positions = new Map(data.positions.map((item) => [item.id, item.position]));
      const known = detail.lists.filter((list) => positions.has(list.id));
      const next = known.reduce(
        (acc, list) => patchList(acc, list.id, { position: positions.get(list.id) ?? list.position }),
        detail,
      );
      return { detail: next, refetch: known.length !== positions.size };
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
      return { detail: next, refetch: known.length !== positions.size };
    }
    // Checklists live in the card dialog's cache, not in the board's.
    case 'checklist':
    case 'checklist-item':
      return { detail, refetch: false };
    default: {
      const unhandled: never = data;
      return unhandled;
    }
  }
}

/**
 * The board with a move response's `rebalanced` applied (null: nothing to respread).
 * A sibling this cache does not know is left to the refetch that follows the mutations.
 */
export function withRebalance(
  detail: BoardDetailDto,
  rebalanced: PositionRebalancedData | null,
): BoardDetailDto {
  return rebalanced ? applyRebalance(detail, rebalanced).detail : detail;
}

/** Labels sort by color (enum order, like the server); equal colors keep their order. */
function sortLabels(labels: LabelDto[]): LabelDto[] {
  return [...labels].sort((a, b) => LABEL_COLORS.indexOf(a.color) - LABEL_COLORS.indexOf(b.color));
}

export function upsertLabel(detail: BoardDetailDto, label: LabelDto): BoardDetailDto {
  const exists = detail.labels.some((item) => item.id === label.id);
  const labels = exists
    ? detail.labels.map((item) => (item.id === label.id ? label : item))
    : [...detail.labels, label];
  return { ...detail, labels: sortLabels(labels) };
}

export function patchLabel(
  detail: BoardDetailDto,
  labelId: string,
  changes: Partial<LabelDto>,
): BoardDetailDto {
  return {
    ...detail,
    labels: sortLabels(
      detail.labels.map((label) => (label.id === labelId ? { ...label, ...changes } : label)),
    ),
  };
}

/** Drops the label from the board and from every card that had it. */
export function removeLabel(detail: BoardDetailDto, labelId: string): BoardDetailDto {
  return {
    ...detail,
    labels: detail.labels.filter((label) => label.id !== labelId),
    cards: detail.cards.map((card) =>
      card.labelIds.includes(labelId)
        ? { ...card, labelIds: card.labelIds.filter((id) => id !== labelId) }
        : card,
    ),
  };
}

/** Same order as the server's: owner first, then admins, then members; earlier joiners first. */
const MEMBER_ROLE_ORDER: Record<BoardRole, number> = { OWNER: 0, ADMIN: 1, MEMBER: 2 };

function sortMembers(members: MemberDto[]): MemberDto[] {
  return [...members].sort(
    (a, b) =>
      MEMBER_ROLE_ORDER[a.role] - MEMBER_ROLE_ORDER[b.role] ||
      a.joinedAt.localeCompare(b.joinedAt) ||
      a.userId.localeCompare(b.userId),
  );
}

export function upsertMember(detail: BoardDetailDto, member: MemberDto): BoardDetailDto {
  const others = detail.members.filter((item) => item.userId !== member.userId);
  return { ...detail, members: sortMembers([...others, member]) };
}

export function patchMember(
  detail: BoardDetailDto,
  userId: string,
  changes: Partial<MemberDto>,
): BoardDetailDto {
  return {
    ...detail,
    members: sortMembers(
      detail.members.map((member) => (member.userId === userId ? { ...member, ...changes } : member)),
    ),
  };
}

/** Drops the member from the board and from every card they were on. */
export function removeMember(detail: BoardDetailDto, userId: string): BoardDetailDto {
  return {
    ...detail,
    members: detail.members.filter((member) => member.userId !== userId),
    cards: detail.cards.map((card) =>
      card.memberIds.includes(userId)
        ? { ...card, memberIds: card.memberIds.filter((id) => id !== userId) }
        : card,
    ),
  };
}

/** The card with the user added to (or taken off) its members; a card this cache lacks is left alone. */
export function setCardMember(
  detail: BoardDetailDto,
  cardId: string,
  userId: string,
  assigned: boolean,
): BoardDetailDto {
  const card = detail.cards.find((item) => item.id === cardId);
  if (!card || card.memberIds.includes(userId) === assigned) return detail;
  const memberIds = assigned
    ? [...card.memberIds, userId]
    : card.memberIds.filter((id) => id !== userId);
  return patchCard(detail, cardId, { memberIds });
}

/** The board with the card added to (or taken off) the current user's watched cards. */
export function setCardWatched(
  detail: BoardDetailDto,
  cardId: string,
  watching: boolean,
): BoardDetailDto {
  if (detail.myWatchedCardIds.includes(cardId) === watching) return detail;
  return {
    ...detail,
    myWatchedCardIds: watching
      ? [...detail.myWatchedCardIds, cardId]
      : detail.myWatchedCardIds.filter((id) => id !== cardId),
  };
}
