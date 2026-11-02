import type { BoardBackground, BoardRole } from './enums.js';
import type { CardSummaryDto } from './cards.js';
import type { LabelDto } from './labels.js';
import type { ListDto } from './lists.js';

export const BOARD_LIMITS = {
  TITLE_MAX: 100,
} as const;

/** Roles from least to most privileged. */
export const BOARD_ROLE_RANK: Record<BoardRole, number> = {
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

/** True when `role` is at least as privileged as `min`. */
export function hasBoardRole(role: BoardRole, min: BoardRole): boolean {
  return BOARD_ROLE_RANK[role] >= BOARD_ROLE_RANK[min];
}

/** Roles that can be given to a member. OWNER is never assignable. */
export type AssignableBoardRole = Exclude<BoardRole, 'OWNER'>;
export const ASSIGNABLE_BOARD_ROLES = ['ADMIN', 'MEMBER'] as const satisfies readonly AssignableBoardRole[];

export interface BoardSummaryDto {
  id: string;
  title: string;
  background: BoardBackground;
  /** The current user's role on this board. */
  myRole: BoardRole;
  updatedAt: string;
}

export interface MemberDto {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: BoardRole;
  joinedAt: string;
}

/** Everything the board page needs in one request. */
export interface BoardDetailDto {
  board: BoardSummaryDto;
  members: MemberDto[];
  labels: LabelDto[];
  /** Active (not archived) lists, ordered by position. */
  lists: ListDto[];
  /** Active cards on the active lists, ordered by position. */
  cards: CardSummaryDto[];
}

export interface CreateBoardRequest {
  title: string;
  background?: BoardBackground;
}

export interface UpdateBoardRequest {
  title?: string;
  background?: BoardBackground;
}

export interface UpdateMemberRequest {
  role: AssignableBoardRole;
}
