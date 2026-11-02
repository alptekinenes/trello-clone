import {
  type BoardDetailDto,
  type BoardRole,
  type CardSummaryDto,
  LABEL_COLORS,
  type LabelDto,
  type ListDto,
  type MemberDto,
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

export function removeMember(detail: BoardDetailDto, userId: string): BoardDetailDto {
  return { ...detail, members: detail.members.filter((member) => member.userId !== userId) };
}
