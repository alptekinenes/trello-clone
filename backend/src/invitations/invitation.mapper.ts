import type {
  AssignableBoardRole,
  BoardRole,
  InvitationDto,
  InvitationPreviewDto,
  InvitationStatus,
} from '@trello/contracts';

/** Columns for the admin-facing DTO and the invitation mail. `tokenHash` is never selected. */
export const INVITATION_SELECT = {
  id: true,
  boardId: true,
  email: true,
  role: true,
  expiresAt: true,
  invitedBy: { select: { id: true, name: true } },
  board: { select: { title: true } },
} as const;

/** Most recently sent first; id breaks ties so every reader sees the same order. */
export const INVITATION_ORDER = [{ updatedAt: 'desc' }, { id: 'asc' }] as const;

/** Columns for the public preview and the accept checks. */
export const PREVIEW_SELECT = {
  email: true,
  role: true,
  status: true,
  expiresAt: true,
  invitedBy: { select: { name: true } },
  board: { select: { title: true } },
} as const;

export interface InvitationRow {
  id: string;
  boardId: string;
  email: string;
  role: BoardRole;
  expiresAt: Date;
  invitedBy: { id: string; name: string };
  board: { title: string };
}

export interface PreviewRow {
  email: string;
  role: BoardRole;
  status: InvitationStatus;
  expiresAt: Date;
  invitedBy: { name: string };
  board: { title: string };
}

/** Invitations never carry OWNER (the DTO only allows ADMIN and MEMBER). */
export function assignableRole(role: BoardRole): AssignableBoardRole {
  if (role === 'OWNER') throw new Error('An invitation cannot carry the OWNER role');
  return role;
}

export function toInvitationDto(row: InvitationRow): InvitationDto {
  return {
    id: row.id,
    boardId: row.boardId,
    email: row.email,
    role: assignableRole(row.role),
    invitedBy: { userId: row.invitedBy.id, name: row.invitedBy.name },
    expiresAt: row.expiresAt.toISOString(),
  };
}

export function toInvitationPreview(row: PreviewRow): InvitationPreviewDto {
  return {
    boardTitle: row.board.title,
    inviterName: row.invitedBy.name,
    email: row.email,
    role: assignableRole(row.role),
    expiresAt: row.expiresAt.toISOString(),
  };
}
