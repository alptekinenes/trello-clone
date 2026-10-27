import { ApiError } from './http';

/** Generic Turkish message for a failed request. Features add their own cases on top. */
export function apiErrorMessage(error: unknown): string {
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
