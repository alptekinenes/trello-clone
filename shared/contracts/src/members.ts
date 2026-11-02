import { type AssignableBoardRole, hasBoardRole } from './boards.js';
import type { BoardRole } from './enums.js';

export interface MemberRef {
  userId: string;
  role: BoardRole;
}

/** Removing yourself is leaving. ADMIN+ removes members, only the OWNER removes admins, nobody removes the owner. */
export type MemberRemovalCheck = 'ALLOWED' | 'OWNER_CANNOT_LEAVE' | 'FORBIDDEN';

export function checkMemberRemoval(actor: MemberRef, target: MemberRef): MemberRemovalCheck {
  if (target.userId === actor.userId) {
    return target.role === 'OWNER' ? 'OWNER_CANNOT_LEAVE' : 'ALLOWED';
  }
  if (target.role === 'OWNER') return 'FORBIDDEN';
  const required: BoardRole = target.role === 'ADMIN' ? 'OWNER' : 'ADMIN';
  return hasBoardRole(actor.role, required) ? 'ALLOWED' : 'FORBIDDEN';
}

/** Only the owner changes roles, and never the owner's own role. */
export function canChangeMemberRole(actorRole: BoardRole, targetRole: BoardRole): boolean {
  return actorRole === 'OWNER' && targetRole !== 'OWNER';
}

/** ADMIN+ invites members; only the OWNER invites admins. */
export function canInviteAs(actorRole: BoardRole, role: AssignableBoardRole): boolean {
  return hasBoardRole(actorRole, role === 'ADMIN' ? 'OWNER' : 'ADMIN');
}
