import type { CreateLabelRequest, LabelDto, UpdateLabelRequest } from '@trello/contracts';
import { apiRequest } from '../../../shared/lib/http';

const labelPath = (labelId: string) => `/labels/${encodeURIComponent(labelId)}`;

export const labelsApi = {
  create: (boardId: string, body: CreateLabelRequest) =>
    apiRequest<LabelDto>(`/boards/${encodeURIComponent(boardId)}/labels`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  update: (labelId: string, body: UpdateLabelRequest) =>
    apiRequest<LabelDto>(labelPath(labelId), { method: 'PATCH', body: JSON.stringify(body) }),

  remove: (labelId: string) => apiRequest<void>(labelPath(labelId), { method: 'DELETE' }),
};
