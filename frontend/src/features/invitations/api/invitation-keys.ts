export const invitationKeys = {
  all: ['invitations'] as const,
  preview: (token: string) => [...invitationKeys.all, 'preview', token] as const,
};
