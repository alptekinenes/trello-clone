import {
  type BoardRole,
  type BoardSummaryDto,
  isBoardBackground,
  type LabelColor,
} from '@trello/contracts';

export const BOARD_SELECT = { id: true, title: true, background: true, updatedAt: true } as const;

export interface BoardRow {
  id: string;
  title: string;
  background: string;
  updatedAt: Date;
}

export function toBoardSummary(board: BoardRow, myRole: BoardRole): BoardSummaryDto {
  return {
    id: board.id,
    title: board.title,
    // Written only through validated DTOs; the fallback guards against manual DB edits.
    background: isBoardBackground(board.background) ? board.background : 'blue',
    myRole,
    updatedAt: board.updatedAt.toISOString(),
  };
}

/** Labels every new board starts with, in display order. */
export const DEFAULT_LABEL_COLORS: readonly LabelColor[] = [
  'GREEN',
  'YELLOW',
  'ORANGE',
  'RED',
  'PURPLE',
  'BLUE',
];
