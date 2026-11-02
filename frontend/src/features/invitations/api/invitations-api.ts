import type { AcceptInvitationResponse, InvitationPreviewDto } from '@trello/contracts';
import { apiRequest } from '../../../shared/lib/http';

const invitationPath = (token: string) => `/invitations/${encodeURIComponent(token)}`;

export const invitationsApi = {
  /** Public: the token is the permission, so no session is needed (or sent). */
  preview: (token: string) =>
    apiRequest<InvitationPreviewDto>(invitationPath(token), {}, { skipAuth: true }),

  accept: (token: string) =>
    apiRequest<AcceptInvitationResponse>(`${invitationPath(token)}/accept`, { method: 'POST' }),
};
