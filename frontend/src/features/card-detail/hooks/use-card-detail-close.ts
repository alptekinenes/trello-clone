import { useQueryClient } from '@tanstack/react-query';
import type { BoardDetailDto } from '@trello/contracts';
import { useLocation, useNavigate } from 'react-router';
import { boardKeys } from '../../boards';
import { focusCardTile } from '../../board-detail';

function openedFromBoard(state: unknown): boolean {
  return typeof state === 'object' && state !== null && 'fromBoard' in state && state.fromBoard === true;
}

/**
 * What to do after the dialog closed natively (the browser has already given the focus
 * back to the opener): leave the card's URL and focus the card's tile. Opened from the
 * board, that is one step back in the history; opened by URL, it is the board.
 */
export function useCardDetailClose(boardId: string, cardId: string) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  return function onClose() {
    if (openedFromBoard(location.state)) navigate(-1);
    else navigate(`/boards/${encodeURIComponent(boardId)}`, { replace: true });
    // Read now: the card may have been archived or moved since the dialog opened.
    const tile = queryClient
      .getQueryData<BoardDetailDto>(boardKeys.detail(boardId))
      ?.cards.find((card) => card.id === cardId);
    if (tile) focusCardTile(tile);
  };
}
