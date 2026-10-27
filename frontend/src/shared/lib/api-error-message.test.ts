import { describe, expect, it } from 'vitest';
import { apiErrorMessage, isNotFound } from './api-error-message';
import { ApiError } from './http';

const apiError = (status: number) => new ApiError(status, null);

describe('apiErrorMessage', () => {
  it.each([
    [403, 'Bu işlem için yetkin yok.'],
    [404, 'Aradığın kayıt bulunamadı. Silinmiş olabilir.'],
    [429, 'Çok fazla istek gönderildi. Biraz bekleyip tekrar dene.'],
    [500, 'Sunucuya şu an ulaşılamıyor. Biraz sonra tekrar dene.'],
    [503, 'Sunucuya şu an ulaşılamıyor. Biraz sonra tekrar dene.'],
    [400, 'Bir şeyler ters gitti. Lütfen tekrar dene.'],
  ])('status %i', (status, message) => {
    expect(apiErrorMessage(apiError(status))).toBe(message);
  });

  it('has a generic message for network errors', () => {
    expect(apiErrorMessage(new TypeError('Failed to fetch'))).toBe(
      'Bir şeyler ters gitti. Lütfen tekrar dene.',
    );
  });
});

describe('isNotFound', () => {
  it('is true only for a 404 ApiError', () => {
    expect(isNotFound(apiError(404))).toBe(true);
    expect(isNotFound(apiError(403))).toBe(false);
    expect(isNotFound(new Error('404'))).toBe(false);
  });
});
