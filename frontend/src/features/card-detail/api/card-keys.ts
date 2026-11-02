import { boardKeys } from '../../boards';

/**
 * Card details live under their board's key, so everything that refreshes the board
 * (the last of a series of changes, say) refreshes the open card too.
 */
export const cardKeys = {
  detail: (boardId: string, cardId: string) => [...boardKeys.detail(boardId), 'card', cardId] as const,
};
