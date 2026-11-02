export const boardInvitationKeys = {
  all: ['board-invitations'] as const,
  list: (boardId: string) => [...boardInvitationKeys.all, boardId] as const,
};
