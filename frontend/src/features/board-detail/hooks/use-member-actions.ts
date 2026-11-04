import {
  type AssignableBoardRole,
  type BoardSummaryDto,
  canChangeMemberRole,
  checkMemberRemoval,
  type MemberDto,
} from '@trello/contracts';
import { useState, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router';
import { apiErrorMessage } from '../../../shared/lib/api-error-message';
import { roleInSentence } from '../../../shared/lib/board-role';
import { showToast } from '../../../shared/store/toast-store';
import { useCurrentUser } from '../../auth';
import {
  useLeaveBoard,
  useRemoveMember,
  useUpdateMemberRole,
} from '../api/use-member-mutations';
import type { Announce } from './use-dialog-status';

export const memberRemoveButtonId = (userId: string) => `member-remove-${userId}`;

/** Rows keep their place when a role changes: joined first, then by id like the server's tie-break. */
export function sortByJoinDate(members: MemberDto[]): MemberDto[] {
  return [...members].sort(
    (a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.userId.localeCompare(b.userId),
  );
}

interface Confirming {
  kind: 'remove' | 'leave';
  member: MemberDto;
}

interface UseMemberActionsOptions {
  board: BoardSummaryDto;
  members: MemberDto[];
  /** The section heading, where the focus lands when no other row has a "Çıkar" button. */
  headingRef: RefObject<HTMLElement | null>;
  /** Text for the dialog's status region. */
  announce: Announce;
}

/**
 * What the current user may do with each member of the board (rules from the shared
 * contracts, which the server enforces too), and the handlers: role change, removal and
 * leaving, the last two behind a confirmation.
 */
export function useMemberActions({ board, members, headingRef, announce }: UseMemberActionsOptions) {
  const navigate = useNavigate();
  const myUserId = useCurrentUser()?.id ?? '';
  const updateRole = useUpdateMemberRole(board.id, (member) =>
    announce(`${member.name} artık ${roleInSentence(member.role)}.`),
  );
  const removeMember = useRemoveMember(board.id);
  const leaveBoard = useLeaveBoard(board.id, myUserId);
  const [confirming, setConfirming] = useState<Confirming | null>(null);

  const rows = sortByJoinDate(members);
  const me = { userId: myUserId, role: board.myRole };

  function abilities(member: MemberDto) {
    const removal = checkMemberRemoval(me, member);
    const isMe = member.userId === myUserId;
    return {
      isMe,
      canChangeRole: canChangeMemberRole(board.myRole, member.role),
      canRemove: removal === 'ALLOWED' && !isMe,
      canLeave: removal === 'ALLOWED' && isMe,
    };
  }

  function changeRole(member: MemberDto, role: AssignableBoardRole) {
    if (role === member.role) return;
    updateRole.mutate({ userId: member.userId, role });
  }

  /** Focus goes to the next row's "Çıkar" button, or to the heading when there is none. */
  function focusAfterRemoval(removed: MemberDto) {
    const at = rows.findIndex((row) => row.userId === removed.userId);
    const nextButton = rows
      .slice(at + 1)
      .map((row) => document.getElementById(memberRemoveButtonId(row.userId)))
      .find((button) => button !== null);
    (nextButton ?? headingRef.current)?.focus();
  }

  function confirm() {
    if (!confirming) return;
    const { kind, member } = confirming;
    if (kind === 'leave') {
      leaveBoard.mutate(undefined, {
        onSuccess: () => {
          showToast(`“${board.title}” panosundan ayrıldın.`);
          navigate('/boards', { replace: true });
        },
      });
      return;
    }
    removeMember.mutate(member.userId, {
      onSuccess: () => {
        // Closing the confirmation first makes the page usable, so the focus can move on.
        flushSync(() => setConfirming(null));
        focusAfterRemoval(member);
        announce(`${member.name} panodan çıkarıldı.`);
      },
    });
  }

  function cancel() {
    setConfirming(null);
    removeMember.reset();
    leaveBoard.reset();
  }

  const confirmError = removeMember.error ?? leaveBoard.error;
  return {
    rows,
    abilities,
    changeRole,
    roleError: updateRole.error ? apiErrorMessage(updateRole.error) : null,
    confirming,
    askRemove: (member: MemberDto) => setConfirming({ kind: 'remove', member }),
    askLeave: (member: MemberDto) => setConfirming({ kind: 'leave', member }),
    confirm,
    cancel,
    isConfirming: removeMember.isPending || leaveBoard.isPending,
    confirmError: confirmError ? apiErrorMessage(confirmError) : null,
  };
}
