import type {
  ChecklistDto,
  ChecklistItemDto,
  CreateChecklistItemRequest,
  CreateChecklistRequest,
  MoveChecklistItemRequest,
  MoveChecklistItemResponse,
  MoveChecklistRequest,
  MoveChecklistResponse,
  UpdateChecklistItemRequest,
  UpdateChecklistRequest,
} from '@trello/contracts';
import { apiRequest } from '../../../shared/lib/http';

const id = encodeURIComponent;
const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });
const patch = (body: unknown): RequestInit => ({ method: 'PATCH', body: JSON.stringify(body) });

export const checklistsApi = {
  create: (cardId: string, body: CreateChecklistRequest) =>
    apiRequest<ChecklistDto>(`/cards/${id(cardId)}/checklists`, post(body)),

  rename: (checklistId: string, body: UpdateChecklistRequest) =>
    apiRequest<ChecklistDto>(`/checklists/${id(checklistId)}`, patch(body)),

  move: (checklistId: string, body: MoveChecklistRequest) =>
    apiRequest<MoveChecklistResponse>(`/checklists/${id(checklistId)}/move`, post(body)),

  remove: (checklistId: string) =>
    apiRequest<void>(`/checklists/${id(checklistId)}`, { method: 'DELETE' }),

  createItem: (checklistId: string, body: CreateChecklistItemRequest) =>
    apiRequest<ChecklistItemDto>(`/checklists/${id(checklistId)}/items`, post(body)),

  updateItem: (itemId: string, body: UpdateChecklistItemRequest) =>
    apiRequest<ChecklistItemDto>(`/checklist-items/${id(itemId)}`, patch(body)),

  moveItem: (itemId: string, body: MoveChecklistItemRequest) =>
    apiRequest<MoveChecklistItemResponse>(`/checklist-items/${id(itemId)}/move`, post(body)),

  removeItem: (itemId: string) =>
    apiRequest<void>(`/checklist-items/${id(itemId)}`, { method: 'DELETE' }),
};
