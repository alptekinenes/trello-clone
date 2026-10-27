import type {
  BoardDetailDto,
  BoardSummaryDto,
  CreateBoardRequest,
  UpdateBoardRequest,
} from '@trello/contracts';
import { apiRequest } from '../../../shared/lib/http';

const boardPath = (boardId: string) => `/boards/${encodeURIComponent(boardId)}`;

export const boardsApi = {
  list: () => apiRequest<BoardSummaryDto[]>('/boards'),

  create: (body: CreateBoardRequest) =>
    apiRequest<BoardSummaryDto>('/boards', { method: 'POST', body: JSON.stringify(body) }),

  get: (boardId: string) => apiRequest<BoardDetailDto>(boardPath(boardId)),

  update: (boardId: string, body: UpdateBoardRequest) =>
    apiRequest<BoardSummaryDto>(boardPath(boardId), {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  remove: (boardId: string) => apiRequest<void>(boardPath(boardId), { method: 'DELETE' }),
};
