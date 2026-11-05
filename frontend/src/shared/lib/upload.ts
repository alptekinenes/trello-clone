import { SOCKET_ID_HEADER } from '@trello/contracts';
import { API_BASE_PATH, ApiError, getAuthHandlers, getSocketId, isApiErrorBody } from './http';

export interface UploadOptions {
  /** Bytes of the request body sent so far, and its total. */
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}

interface RawResponse {
  status: number;
  text: string;
}

function abortError(): DOMException {
  return new DOMException('The upload was aborted.', 'AbortError');
}

/** One attempt. `fetch` cannot report upload progress, so this uses XMLHttpRequest. */
function sendOnce(
  path: string,
  body: FormData,
  accessToken: string | null,
  { onProgress, signal }: UploadOptions,
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    const finish = () => signal?.removeEventListener('abort', onAbort);

    xhr.open('POST', new URL(`${API_BASE_PATH}${path}`, window.location.origin).toString());
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    if (accessToken) xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    const socketId = getSocketId();
    if (socketId) xhr.setRequestHeader(SOCKET_ID_HEADER, socketId);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded, event.total);
    };
    xhr.onload = () => {
      finish();
      resolve({ status: xhr.status, text: xhr.responseText });
    };
    // Same shape as fetch's failure, so `isNetworkError` recognizes it.
    xhr.onerror = () => {
      finish();
      reject(new TypeError('Network request failed'));
    };
    xhr.onabort = () => {
      finish();
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    xhr.send(body);
  });
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Uploads multipart `body` to `path` (relative to /api/v1) and returns the parsed JSON.
 * Like `apiRequest`: Bearer token, socket id, one refresh-and-retry on a 401, `ApiError` on
 * failure. Aborting through `signal` rejects with an `AbortError`.
 */
export async function apiUpload<T>(path: string, body: FormData, options: UploadOptions = {}): Promise<T> {
  const auth = getAuthHandlers();
  let response = await sendOnce(path, body, auth?.getAccessToken() ?? null, options);

  if (response.status === 401 && auth) {
    const freshToken = await auth.refreshAccessToken();
    if (freshToken) response = await sendOnce(path, body, freshToken, options);
  }

  const data = parseJson(response.text);
  if (response.status < 200 || response.status >= 300) {
    throw new ApiError(response.status, isApiErrorBody(data) ? data : null);
  }
  return data as T;
}
