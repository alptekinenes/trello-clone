import type { BoardDetailDto, CardSummaryDto, ListDto } from '@trello/contracts';
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
