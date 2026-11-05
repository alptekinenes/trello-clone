import type { CardDetailDto, CardSummaryDto, UpdateCardRequest } from '@trello/contracts';
import { apiRequest } from '../../../shared/lib/http';

const cardPath = (cardId: string) => `/cards/${encodeURIComponent(cardId)}`;

const labelPath = (cardId: string, labelId: string) =>
  `${cardPath(cardId)}/labels/${encodeURIComponent(labelId)}`;

const memberPath = (cardId: string, userId: string) =>
  `${cardPath(cardId)}/members/${encodeURIComponent(userId)}`;

export const cardDetailApi = {
  get: (cardId: string) => apiRequest<CardDetailDto>(cardPath(cardId)),

  update: (cardId: string, body: UpdateCardRequest) =>
    apiRequest<CardSummaryDto>(cardPath(cardId), { method: 'PATCH', body: JSON.stringify(body) }),

  assignLabel: (cardId: string, labelId: string) =>
    apiRequest<void>(labelPath(cardId, labelId), { method: 'PUT' }),

  unassignLabel: (cardId: string, labelId: string) =>
    apiRequest<void>(labelPath(cardId, labelId), { method: 'DELETE' }),

  assignMember: (cardId: string, userId: string) =>
    apiRequest<void>(memberPath(cardId, userId), { method: 'PUT' }),

  unassignMember: (cardId: string, userId: string) =>
    apiRequest<void>(memberPath(cardId, userId), { method: 'DELETE' }),
};
