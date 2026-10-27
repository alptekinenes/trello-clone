import type { BoardRole, MemberDto } from '@trello/contracts';

/** Columns needed to build a MemberDto. */
export const MEMBER_SELECT = {
  role: true,
  joinedAt: true,
  user: { select: { id: true, name: true, email: true, avatarUrl: true } },
} as const;

export interface MemberRow {
  role: BoardRole;
  joinedAt: Date;
  user: { id: string; name: string; email: string; avatarUrl: string | null };
}

export function toMemberDto(row: MemberRow): MemberDto {
  return {
    userId: row.user.id,
    name: row.user.name,
    email: row.user.email,
    avatarUrl: row.user.avatarUrl,
    role: row.role,
    joinedAt: row.joinedAt.toISOString(),
  };
}

/** Owner first, then admins, then members; ties by join date. */
export const MEMBER_ORDER = [{ role: 'asc' }, { joinedAt: 'asc' }] as const;
