import type { CardDetailDto, CardSummaryDto, UpdateCardRequest } from '@trello/contracts';
import { apiRequest } from '../../../shared/lib/http';

const cardPath = (cardId: string) => `/cards/${encodeURIComponent(cardId)}`;

export const cardDetailApi = {
  get: (cardId: string) => apiRequest<CardDetailDto>(cardPath(cardId)),

  update: (cardId: string, body: UpdateCardRequest) =>
    apiRequest<CardSummaryDto>(cardPath(cardId), { method: 'PATCH', body: JSON.stringify(body) }),
};
