import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CreateInvitationRequest,
  type CreateInvitationResponse,
  ErrorCode,
  type InvitationDto,
} from '@trello/contracts';
import { ApiError } from '../../../shared/lib/http';
import { boardKeys } from '../../boards';
import { upsertMember } from '../lib/board-cache';
import { boardInvitationKeys } from './board-invitation-keys';
import { invitationsApi } from './invitations-api';
import { boardMutationKey, useBoardMutation } from './use-board-mutation';

/** The board's pending invitations. Only admins may ask: callers render this for admins only. */
export function useBoardInvitations(boardId: string) {
  return useQuery({
    queryKey: boardInvitationKeys.list(boardId),
    queryFn: () => invitationsApi.list(boardId),
  });
}

/** Newest first, like the server's list: the (re)sent invitation replaces its old row on top. */
function withInvitationOnTop(list: InvitationDto[] | undefined, invitation: InvitationDto) {
  return list && [invitation, ...list.filter((item) => item.id !== invitation.id)];
}

interface CreateInvitationHandlers {
  onSuccess?: (response: CreateInvitationResponse, variables: CreateInvitationRequest) => void;
  onError?: (error: Error, variables: CreateInvitationRequest) => void;
}

/**
 * Invites an email address. Not optimistic: what happens (member added, or a link made)
 * is only known from the answer. Shares the board's mutation key with the other board
 * writes, so the board refetches once, after the last of them.
 *
 * `handlers` run for every request this hook makes, even when a newer one has started:
 * callbacks given to `mutate()` are dropped then, and the link of the older request
 * (which the server has already swapped for a new one) would never be shown.
 */
export function useCreateInvitation(boardId: string, handlers: CreateInvitationHandlers = {}) {
  const queryClient = useQueryClient();
  const listKey = boardInvitationKeys.list(boardId);

  return useBoardMutation({
    boardId,
    mutationFn: (body: CreateInvitationRequest) => invitationsApi.create(boardId, body),
    onSuccessCache: (detail, response: CreateInvitationResponse) =>
      response.result === 'MEMBER_ADDED' ? upsertMember(detail, response.member) : detail,
    onSuccess: (response, variables) => {
      const { email } = variables;
      // The server trims and lowercases addresses the same way.
      const invited = email.trim().toLowerCase();
      queryClient.setQueryData<InvitationDto[]>(listKey, (list) =>
        response.result === 'INVITATION_CREATED'
          ? withInvitationOnTop(list, response.invitation)
          : // The address is a member now; its pending invitation (if any) was accepted.
            list?.filter((item) => item.email !== invited),
      );
      void queryClient.invalidateQueries({ queryKey: listKey });
      handlers.onSuccess?.(response, variables);
    },
    // A refusal (already a member, ...) means the list on screen may be out of date.
    onError: (error, variables) => {
      void queryClient.invalidateQueries({ queryKey: listKey });
      handlers.onError?.(error, variables);
    },
  });
}

/** True when the server says the invitation was accepted already. */
export function isInvitationUsed(error: unknown): boolean {
  return error instanceof ApiError && error.code === ErrorCode.INVITATION_USED;
}

/**
 * Optimistic: the invitation leaves the list at once and comes back if the request fails.
 * Revoking one that was accepted meanwhile (409) also refreshes the board, which has a new member,
 * unless a write on the board is still on its way (it refreshes the board when it settles).
 * `onRevoked` runs for every successful request, even when a newer one has started.
 */
export function useRevokeInvitation(boardId: string, onRevoked?: () => void) {
  const queryClient = useQueryClient();
  const listKey = boardInvitationKeys.list(boardId);

  return useMutation({
    mutationFn: (invitationId: string) => invitationsApi.revoke(boardId, invitationId),
    onMutate: async (invitationId) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<InvitationDto[]>(listKey);
      queryClient.setQueryData<InvitationDto[]>(listKey, (list) =>
        list?.filter((item) => item.id !== invitationId),
      );
      return { previous };
    },
    onError: (error, _invitationId, context) => {
      if (context?.previous) queryClient.setQueryData(listKey, context.previous);
      // A running board write (an optimistic card move, say) must not be overwritten by a refetch;
      // the last of them refetches the board itself.
      const boardBusy = queryClient.isMutating({ mutationKey: boardMutationKey(boardId) }) > 0;
      if (isInvitationUsed(error) && !boardBusy) {
        void queryClient.invalidateQueries({ queryKey: boardKeys.detail(boardId) });
      }
    },
    onSuccess: () => onRevoked?.(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: listKey }),
  });
}
