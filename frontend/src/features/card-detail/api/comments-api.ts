import type { CardFeedPageDto, CommentBodyRequest, CommentDto } from '@trello/contracts';
import { apiRequest } from '../../../shared/lib/http';

export interface FeedRequest {
  details: boolean;
  /** Opaque value from the previous page. */
  cursor: string | null;
}

export const commentsApi = {
  feed: (cardId: string, { details, cursor }: FeedRequest) => {
    const query = new URLSearchParams({ details: String(details) });
    if (cursor !== null) query.set('cursor', cursor);
    return apiRequest<CardFeedPageDto>(`/cards/${encodeURIComponent(cardId)}/feed?${query}`);
  },

  add: (cardId: string, body: CommentBodyRequest) =>
    apiRequest<CommentDto>(`/cards/${encodeURIComponent(cardId)}/comments`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
