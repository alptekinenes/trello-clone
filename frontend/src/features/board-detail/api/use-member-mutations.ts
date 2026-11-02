import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AssignableBoardRole, BoardSummaryDto, MemberDto } from '@trello/contracts';
import { boardKeys } from '../../boards';
import { patchMember, removeMember, upsertMember } from '../lib/board-cache';
import { boardInvitationKeys } from './board-invitation-keys';
import { membersApi } from './members-api';
import { useBoardMutation } from './use-board-mutation';

export interface UpdateMemberRoleVariables {
  userId: string;
  role: AssignableBoardRole;
}

/**
 * Optimistic: the new role shows at once and is rolled back if the request fails.
 * `onChanged` runs for every successful request, even when a newer one has started
 * (callbacks given to `mutate()` are dropped then).
 */
export function useUpdateMemberRole(boardId: string, onChanged?: (member: MemberDto) => void) {
  return useBoardMutation({
    boardId,
    mutationFn: ({ userId, role }: UpdateMemberRoleVariables) =>
      membersApi.updateRole(boardId, userId, role),
    optimistic: (detail, { userId, role }) => patchMember(detail, userId, { role }),
    onSuccessCache: (detail, member: MemberDto) => upsertMember(detail, member),
    onSuccess: (member) => onChanged?.(member),
  });
}

/** Not optimistic: the confirmation dialog waits for the answer. */
export function useRemoveMember(boardId: string) {
  return useBoardMutation({
    boardId,
    mutationFn: (userId: string) => membersApi.remove(boardId, userId),
    onSuccessCache: (detail, _data, userId) => removeMember(detail, userId),
  });
}

/**
 * The current user removes themselves. Not `useBoardMutation`: the board is gone for them,
 * so refetching it would only 404. Like deleting a board, it is dropped from the caches.
 */
export function useLeaveBoard(boardId: string, myUserId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => membersApi.remove(boardId, myUserId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: boardKeys.detail(boardId) });
      queryClient.removeQueries({ queryKey: boardInvitationKeys.list(boardId) });
      queryClient.setQueryData<BoardSummaryDto[]>(boardKeys.list(), (boards) =>
        boards?.filter((board) => board.id !== boardId),
      );
      return queryClient.invalidateQueries({ queryKey: boardKeys.list() });
    },
  });
}
