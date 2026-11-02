import type { AssignableBoardRole, MemberDto } from './boards.js';

export const INVITATION_LIMITS = {
  /** An invitation link works for this many days after it was (re)sent. */
  TTL_DAYS: 7,
  /** base64url of 32 random bytes. */
  TOKEN_LENGTH: 43,
} as const;

const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Cheap shape check before any lookup; anything else is "not found". */
export function isInvitationToken(value: string): boolean {
  return INVITATION_TOKEN_PATTERN.test(value);
}

export interface CreateInvitationRequest {
  /** Trimmed and lowercased by the server. */
  email: string;
  /** ADMIN only when the inviter is the board owner. */
  role: AssignableBoardRole;
}

/** A pending invitation as board admins see it. Never carries the token or its hash. */
export interface InvitationDto {
  id: string;
  boardId: string;
  email: string;
  role: AssignableBoardRole;
  invitedBy: { userId: string; name: string };
  expiresAt: string;
}

export type CreateInvitationResponse =
  | { result: 'MEMBER_ADDED'; member: MemberDto }
  | {
      result: 'INVITATION_CREATED';
      invitation: InvitationDto;
      /** `${APP_URL}/invitations/<token>`; the only place the raw token is ever returned. */
      inviteUrl: string;
    };

/** Public preview behind GET /invitations/:token. */
export interface InvitationPreviewDto {
  boardTitle: string;
  inviterName: string;
  /** The address the invitation was sent to; the accepting account must use it. */
  email: string;
  role: AssignableBoardRole;
  expiresAt: string;
}

export interface AcceptInvitationResponse {
  boardId: string;
}
