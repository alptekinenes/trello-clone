import type { ErrorCode, UserDto } from '@trello/contracts';
import { HttpResponse } from 'msw';

export const testUser: UserDto = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ayse@example.com',
  name: 'Ayşe Yılmaz',
  avatarUrl: null,
};

/** An API error response in the backend's ApiErrorBody shape. */
export function apiError(status: number, code: ErrorCode, message = 'Error') {
  return HttpResponse.json(
    { statusCode: status, code, message, path: '/api/v1/test', timestamp: '2026-01-01T00:00:00.000Z' },
    { status },
  );
}
