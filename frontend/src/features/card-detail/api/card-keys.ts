import { boardKeys } from '../../boards';

/**
 * Card details live under their board's key, so everything that refreshes the board
 * (the last of a series of changes, say) refreshes the open card too.
 */
export const cardKeys = {
  detail: (boardId: string, cardId: string) => [...boardKeys.detail(boardId), 'card', cardId] as const,
  /** Both feeds (with and without details) of a card. */
  feeds: (boardId: string, cardId: string) => [...cardKeys.detail(boardId, cardId), 'feed'] as const,
  /** The feed lives under the board's key too: a refresh of the board refreshes it. */
  feed: (boardId: string, cardId: string, details: boolean) =>
    [...cardKeys.feeds(boardId, cardId), { details }] as const,
};
