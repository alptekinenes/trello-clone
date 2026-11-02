import type { LabelColor } from './enums.js';

export const LABEL_LIMITS = { NAME_MAX: 50 } as const;

export interface LabelDto {
  id: string;
  boardId: string;
  /** May be empty: a color-only label. */
  name: string;
  color: LabelColor;
}

export interface CreateLabelRequest {
  /** Trimmed; defaults to "". */
  name?: string;
  color: LabelColor;
}

export interface UpdateLabelRequest {
  name?: string;
  color?: LabelColor;
}
