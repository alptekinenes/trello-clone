import type { BoardDetailDto, MemberRef } from '@trello/contracts';
import { useCurrentUser } from '../../auth';

/** The signed-in user with their role on this board, or null when nobody is signed in. */
export function useCommentViewer(board: BoardDetailDto): MemberRef | null {
  const user = useCurrentUser();
  return user ? { userId: user.id, role: board.board.myRole } : null;
}
