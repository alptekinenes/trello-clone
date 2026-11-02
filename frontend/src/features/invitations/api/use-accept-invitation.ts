import { useMutation, useQueryClient } from '@tanstack/react-query';
import { boardKeys } from '../../boards';
import { invitationKeys } from './invitation-keys';
import { invitationsApi } from './invitations-api';

/** Joins the board. Safe to repeat: the server answers the same for a member who accepted already. */
export function useAcceptInvitation(token: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => invitationsApi.accept(token),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: invitationKeys.preview(token) });
      // The new board belongs in the user's list.
      return queryClient.invalidateQueries({ queryKey: boardKeys.list() });
    },
  });
}
