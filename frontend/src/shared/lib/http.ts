import type { ApiErrorBody, ErrorCode } from '@trello/contracts';

export const API_BASE_PATH = '/api/v1';

/** Error thrown for every non-2xx API response. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody | null;

  constructor(status: number, body: ApiErrorBody | null) {
    super(body?.message ?? `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }

  get code(): ErrorCode | undefined {
    return this.body?.code;
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    'statusCode' in value
  );
}

async function readErrorBody(response: Response): Promise<ApiErrorBody | null> {
  try {
    const data: unknown = await response.json();
    return isApiErrorBody(data) ? data : null;
  } catch {
    return null;
  }
}

/**
 * Calls the API and returns the parsed JSON body.
 * `path` is relative to /api/v1, e.g. `/boards`.
 */
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = new URL(`${API_BASE_PATH}${path}`, window.location.origin);
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, { ...init, headers, credentials: 'include' });

  if (!response.ok) {
    throw new ApiError(response.status, await readErrorBody(response));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
