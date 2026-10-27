import type { BoardDetailDto, ListDto } from '@trello/contracts';

/** Board order: position, then id (same as the server). */
export function sortByPosition<T extends { id: string; position: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

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
