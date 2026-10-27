import type { BoardBackground, BoardRole, LabelColor } from './enums.js';

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

export interface LabelDto {
  id: string;
  boardId: string;
  name: string;
  color: LabelColor;
}

/** Everything the board page needs in one request. Lists and cards join in later phases. */
export interface BoardDetailDto {
  board: BoardSummaryDto;
  members: MemberDto[];
  labels: LabelDto[];
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
