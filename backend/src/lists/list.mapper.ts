import type { ListDto } from '@trello/contracts';

export const LIST_SELECT = {
  id: true,
  boardId: true,
  title: true,
  position: true,
  archivedAt: true,
} as const;

/** Board order; id breaks ties so every reader sees the same order. */
export const LIST_ORDER = [{ position: 'asc' }, { id: 'asc' }] as const;

export interface ListRow {
  id: string;
  boardId: string;
  title: string;
  position: number;
  archivedAt: Date | null;
}

export function toListDto(list: ListRow): ListDto {
  return {
    id: list.id,
    boardId: list.boardId,
    title: list.title,
    position: list.position,
    archivedAt: list.archivedAt?.toISOString() ?? null,
  };
}
