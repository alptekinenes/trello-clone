import type { UpdateMeRequest, UserDto } from '@trello/contracts';
import { apiRequest } from '../../../shared/lib/http';

export const usersApi = {
  updateMe: (body: UpdateMeRequest) =>
    apiRequest<UserDto>('/users/me', { method: 'PATCH', body: JSON.stringify(body) }),
};
