import type { LabelColor, LabelDto } from '@trello/contracts';

export const LABEL_SELECT = { id: true, boardId: true, name: true, color: true } as const;

/**
 * Enum order (GREEN, YELLOW ...) matches the default label order; creation time
 * and id make the order of same-colored labels deterministic.
 */
export const LABEL_ORDER = [{ color: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] as const;

export interface LabelRow {
  id: string;
  boardId: string;
  name: string;
  color: LabelColor;
}

export function toLabelDto(label: LabelRow): LabelDto {
  return { id: label.id, boardId: label.boardId, name: label.name, color: label.color };
}
