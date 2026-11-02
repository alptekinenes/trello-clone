import { type BoardRole, canInviteAs, type InvitationDto } from '@trello/contracts';
import { type RefObject, useEffect } from 'react';
import { apiErrorMessage } from '../../../shared/lib/api-error-message';
import {
  isInvitationUsed,
  useBoardInvitations,
  useRevokeInvitation,
} from '../api/use-board-invitations';
import type { Announce } from './use-dialog-status';

export const revokeButtonId = (invitationId: string) => `invitation-revoke-${invitationId}`;

interface UsePendingInvitationsOptions {
  boardId: string;
  /** What the current user is on the board; decides which invitations they may manage. */
  myRole: BoardRole;
  /** The section heading, where the focus lands when no other row has a button. */
  headingRef: RefObject<HTMLElement | null>;
  /** Text for the dialog's status region. */
  announce: Announce;
}

/** The board's pending invitations and revoking one of them. */
export function usePendingInvitations({
  boardId,
  myRole,
  headingRef,
  announce,
}: UsePendingInvitationsOptions) {
  const query = useBoardInvitations(boardId);
  const revokeInvitation = useRevokeInvitation(boardId, () => announce('Davet iptal edildi.'));
  const invitations = query.data;
  const isLoading = query.isPending;

  // The visible "yükleniyor" line is not a live region (it appears together with the dialog, which
  // screen readers do not announce); the dialog's own region, already there, says it instead.
  useEffect(() => {
    if (!isLoading) return;
    announce('Bekleyen davetler yükleniyor…', { silent: true });
    return () => announce('', { silent: true });
  }, [isLoading, announce]);

  /** Admins see every invitation but handle only the ones they could have made themselves. */
  const canManage = (invitation: InvitationDto) => canInviteAs(myRole, invitation.role);

  function revoke(invitation: InvitationDto) {
    if (!canManage(invitation)) return;
    const at = invitations?.findIndex((item) => item.id === invitation.id) ?? -1;
    const next = invitations?.[at + 1];
    // The row is gone at once (optimistic), so the focus moves on before it.
    const target = next ? document.getElementById(revokeButtonId(next.id)) : headingRef.current;
    target?.focus();
    revokeInvitation.mutate(invitation.id);
  }

  const revokeError = revokeInvitation.error;
  return {
    invitations,
    isLoading,
    canManage,
    loadError: query.error ? apiErrorMessage(query.error) : null,
    retry: () => void query.refetch(),
    isRetrying: query.isRefetching,
    revoke,
    revokeError: revokeError
      ? isInvitationUsed(revokeError)
        ? 'Davet az önce kabul edildi.'
        : apiErrorMessage(revokeError)
      : null,
  };
}
