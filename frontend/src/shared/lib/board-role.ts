import type { BoardRole } from '@trello/contracts';

/** What a board role is called in the interface (as a label, a heading or an option). */
export const ROLE_LABEL: Record<BoardRole, string> = {
  OWNER: 'Sahip',
  ADMIN: 'Yönetici',
  MEMBER: 'Üye',
};

/** The role name in the middle of a sentence: "Ayşe artık yönetici." */
export function roleInSentence(role: BoardRole): string {
  return ROLE_LABEL[role].toLocaleLowerCase('tr-TR');
}
