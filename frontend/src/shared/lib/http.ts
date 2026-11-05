import { SOCKET_ID_HEADER, type ApiErrorBody, type ErrorCode } from '@trello/contracts';

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

/**
 * Hooks the auth feature plugs in, so this shared client does not depend on it.
 * getAccessToken: token to send as Bearer.
 * refreshAccessToken: new token after a 401, or null when the session is gone.
 */
export interface AuthHandlers {
  getAccessToken: () => string | null;
  refreshAccessToken: () => Promise<string | null>;
}

let authHandlers: AuthHandlers | null = null;

export function setAuthHandlers(handlers: AuthHandlers | null): void {
  authHandlers = handlers;
}

/** The same token source, for the socket client (it must not depend on the auth feature either). */
export function getAuthHandlers(): AuthHandlers | null {
  return authHandlers;
}

let socketIdSource: () => string | null = () => null;

/**
 * Where requests learn the id of the live socket, so the server does not echo
 * the change back to it. The socket client registers itself; this file cannot
 * import it (the client reads the auth handlers from here).
 */
export function setSocketIdSource(source: () => string | null): void {
  socketIdSource = source;
}

/** The id of the live socket, for requests made outside `apiRequest` (uploads). */
export function getSocketId(): string | null {
  return socketIdSource();
}

export interface RequestOptions {
  /** No Bearer token and no refresh-and-retry. Used by the auth endpoints themselves. */
  skipAuth?: boolean;
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
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

function send(
  path: string,
  init: RequestInit,
  accessToken: string | null,
  socketId: string | null,
): Promise<Response> {
  const url = new URL(`${API_BASE_PATH}${path}`, window.location.origin);
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  if (socketId) {
    headers.set(SOCKET_ID_HEADER, socketId);
  }
  return fetch(url, { ...init, headers, credentials: 'include' });
}

/**
 * Calls the API and returns the parsed JSON body.
 * `path` is relative to /api/v1, e.g. `/boards`.
 * On a 401 it refreshes the session once and retries the request.
 */
export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<T> {
  const auth = options.skipAuth ? null : authHandlers;
  const socketId = options.skipAuth ? null : socketIdSource();
  let response = await send(path, init, auth?.getAccessToken() ?? null, socketId);

  if (response.status === 401 && auth) {
    const freshToken = await auth.refreshAccessToken();
    if (freshToken) {
      response = await send(path, init, freshToken, socketId);
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readErrorBody(response));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
