import { ErrorCode } from '@trello/contracts';
import { ApiError } from './http';

/** Shown when a change lost against someone else's change; the data was reloaded. */
export const CONFLICT_MESSAGE = 'Bu sırada başka biri değiştirdi. Sayfa yenilendi.';

export const NETWORK_ERROR_MESSAGE =
  'Bağlantı kurulamadı. İnternet bağlantını kontrol edip tekrar dene.';

/** `fetch` rejects with a TypeError when the request never got an answer. */
export function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}

/**
 * The change was refused because the data moved on under the user (a position
 * anchor that changed or is gone). Other 409s (email taken, already a member, ...)
 * have their own messages in their features.
 */
export function isStaleConflict(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    (error.code === ErrorCode.POSITION_CONFLICT || error.code === ErrorCode.CONFLICT)
  );
}

/** Generic Turkish message for a failed request. Features add their own cases on top. */
export function apiErrorMessage(error: unknown): string {
  if (isNetworkError(error)) return NETWORK_ERROR_MESSAGE;
  if (isStaleConflict(error)) return CONFLICT_MESSAGE;
  if (error instanceof ApiError) {
    if (error.status === 403) return 'Bu işlem için yetkin yok.';
    if (error.status === 404) return 'Aradığın kayıt bulunamadı. Silinmiş olabilir.';
    if (error.status === 429) return 'Çok fazla istek gönderildi. Biraz bekleyip tekrar dene.';
    if (error.status >= 500) return 'Sunucuya şu an ulaşılamıyor. Biraz sonra tekrar dene.';
  }
  return 'Bir şeyler ters gitti. Lütfen tekrar dene.';
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
