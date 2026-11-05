import type { BoardDetailDto, CardDetailDto, MemberDto } from '@trello/contracts';
import { useToggleCardMember } from '../api/use-card-mutations';
import { useCardPanel } from './use-card-panel';

/**
 * Members of the open card. The card keeps ids only, so what shows is the board's members
 * that the card has, in assignment order: the id of someone who left the board never shows.
 */
export function useCardMembers(board: BoardDetailDto, card: CardDetailDto) {
  const panel = useCardPanel('members');
  const toggleMember = useToggleCardMember(board.board.id, card.id);
  const assigned = new Set(card.memberIds);
  const byId = new Map(board.members.map((member) => [member.userId, member]));
  const cardMembers = card.memberIds
    .map((userId) => byId.get(userId))
    .filter((member): member is MemberDto => member !== undefined);

  return {
    panel,
    cardMembers,
    boardMembers: board.members,
    isAssigned: (userId: string) => assigned.has(userId),
    toggle: (userId: string, isAssigned: boolean) =>
      toggleMember.mutate({ userId, assigned: isAssigned }),
  };
}
