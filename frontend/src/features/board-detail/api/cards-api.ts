import type {
  CardSummaryDto,
  CreateCardRequest,
  MoveCardRequest,
  MoveCardResponse,
  UpdateCardRequest,
} from '@trello/contracts';
import { apiRequest } from '../../../shared/lib/http';

const cardPath = (cardId: string) => `/cards/${encodeURIComponent(cardId)}`;

export const cardsApi = {
  archived: (boardId: string) =>
    apiRequest<CardSummaryDto[]>(`/boards/${encodeURIComponent(boardId)}/cards?archived=true`),

  create: (listId: string, body: CreateCardRequest) =>
    apiRequest<CardSummaryDto>(`/lists/${encodeURIComponent(listId)}/cards`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  update: (cardId: string, body: UpdateCardRequest) =>
    apiRequest<CardSummaryDto>(cardPath(cardId), { method: 'PATCH', body: JSON.stringify(body) }),

  move: (cardId: string, body: MoveCardRequest) =>
    apiRequest<MoveCardResponse>(`${cardPath(cardId)}/move`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  remove: (cardId: string) => apiRequest<void>(cardPath(cardId), { method: 'DELETE' }),
};
