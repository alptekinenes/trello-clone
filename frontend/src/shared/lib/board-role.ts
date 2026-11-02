import type { BoardRole } from '@trello/contracts';

/** What a board role is called in the interface. */
export const ROLE_LABEL: Record<BoardRole, string> = {
  OWNER: 'Sahip',
  ADMIN: 'Yönetici',
  MEMBER: 'Üye',
};
