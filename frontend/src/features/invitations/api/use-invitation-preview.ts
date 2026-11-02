import { useQuery } from '@tanstack/react-query';
import { isInvitationToken } from '@trello/contracts';
import { invitationKeys } from './invitation-keys';
import { invitationsApi } from './invitations-api';

/**
 * What the invitation is for. A token that cannot be one is not even asked about, and
 * `enabled` turns the query off once the invitation has been accepted (its preview is gone).
 */
export function useInvitationPreview(token: string, enabled = true) {
  return useQuery({
    queryKey: invitationKeys.preview(token),
    queryFn: () => invitationsApi.preview(token),
    enabled: enabled && isInvitationToken(token),
  });
}
