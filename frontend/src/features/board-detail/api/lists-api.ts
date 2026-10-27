import type {
  CreateListRequest,
  ListDto,
  MoveListRequest,
  MoveListResponse,
  UpdateListRequest,
} from '@trello/contracts';
import { apiRequest } from '../../../shared/lib/http';

const listPath = (listId: string) => `/lists/${encodeURIComponent(listId)}`;
const boardListsPath = (boardId: string) => `/boards/${encodeURIComponent(boardId)}/lists`;

export const listsApi = {
  archived: (boardId: string) => apiRequest<ListDto[]>(`${boardListsPath(boardId)}?archived=true`),

  create: (boardId: string, body: CreateListRequest) =>
    apiRequest<ListDto>(boardListsPath(boardId), { method: 'POST', body: JSON.stringify(body) }),

  update: (listId: string, body: UpdateListRequest) =>
    apiRequest<ListDto>(listPath(listId), { method: 'PATCH', body: JSON.stringify(body) }),

  move: (listId: string, body: MoveListRequest) =>
    apiRequest<MoveListResponse>(`${listPath(listId)}/move`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  remove: (listId: string) => apiRequest<void>(listPath(listId), { method: 'DELETE' }),
};
