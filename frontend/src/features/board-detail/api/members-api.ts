import type { AssignableBoardRole, MemberDto, UpdateMemberRequest } from '@trello/contracts';
import { apiRequest } from '../../../shared/lib/http';

const memberPath = (boardId: string, userId: string) =>
  `/boards/${encodeURIComponent(boardId)}/members/${encodeURIComponent(userId)}`;

export const membersApi = {
  updateRole: (boardId: string, userId: string, role: AssignableBoardRole) => {
    const body: UpdateMemberRequest = { role };
    return apiRequest<MemberDto>(memberPath(boardId, userId), {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  /** Removes another member, or the caller themselves (leaving the board). */
  remove: (boardId: string, userId: string) =>
    apiRequest<void>(memberPath(boardId, userId), { method: 'DELETE' }),
};
