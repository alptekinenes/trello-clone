import type {
  CreateInvitationRequest,
  CreateInvitationResponse,
  InvitationDto,
} from '@trello/contracts';
import { apiRequest } from '../../../shared/lib/http';

const invitationsPath = (boardId: string) => `/boards/${encodeURIComponent(boardId)}/invitations`;

export const invitationsApi = {
  create: (boardId: string, body: CreateInvitationRequest) =>
    apiRequest<CreateInvitationResponse>(invitationsPath(boardId), {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  list: (boardId: string) => apiRequest<InvitationDto[]>(invitationsPath(boardId)),

  revoke: (boardId: string, invitationId: string) =>
    apiRequest<void>(`${invitationsPath(boardId)}/${encodeURIComponent(invitationId)}`, {
      method: 'DELETE',
    }),
};
