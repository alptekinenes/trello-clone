import { ErrorCode } from '@trello/contracts';
import { describe, expect, it } from 'vitest';
import {
  apiErrorMessage,
  CONFLICT_MESSAGE,
  isNetworkError,
  isNotFound,
  isStaleConflict,
  NETWORK_ERROR_MESSAGE,
} from './api-error-message';
import { ApiError } from './http';

const apiError = (status: number, code?: ErrorCode) =>
  new ApiError(
    status,
    code ? { statusCode: status, code, message: code, path: '/x', timestamp: '' } : null,
  );

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

  it('explains a conflict in plain words', () => {
    expect(CONFLICT_MESSAGE).toBe('Bu sırada başka biri değiştirdi. Sayfa yenilendi.');
    expect(apiErrorMessage(apiError(409, ErrorCode.POSITION_CONFLICT))).toBe(CONFLICT_MESSAGE);
    expect(apiErrorMessage(apiError(409, ErrorCode.CONFLICT))).toBe(CONFLICT_MESSAGE);
  });

  it('does not call another 409 a conflict over the data', () => {
    expect(apiErrorMessage(apiError(409, ErrorCode.ALREADY_MEMBER))).toBe(
      'Bir şeyler ters gitti. Lütfen tekrar dene.',
    );
  });

  it('tells the user the connection failed when the request got no answer', () => {
    expect(NETWORK_ERROR_MESSAGE).toMatch(/^Bağlantı kurulamadı/);
    expect(apiErrorMessage(new TypeError('Failed to fetch'))).toBe(NETWORK_ERROR_MESSAGE);
  });
});

describe('isStaleConflict', () => {
  it('is true for a 409 about positions or a plain conflict', () => {
    expect(isStaleConflict(apiError(409, ErrorCode.POSITION_CONFLICT))).toBe(true);
    expect(isStaleConflict(apiError(409, ErrorCode.CONFLICT))).toBe(true);
  });

  it('is false for other 409s, other statuses and other errors', () => {
    expect(isStaleConflict(apiError(409, ErrorCode.EMAIL_TAKEN))).toBe(false);
    expect(isStaleConflict(apiError(400, ErrorCode.INVALID_TARGET))).toBe(false);
    expect(isStaleConflict(new Error('409'))).toBe(false);
  });
});

describe('isNetworkError', () => {
  it('is true only for a TypeError', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkError(apiError(500))).toBe(false);
  });
});

describe('isNotFound', () => {
  it('is true only for a 404 ApiError', () => {
    expect(isNotFound(apiError(404))).toBe(true);
    expect(isNotFound(apiError(403))).toBe(false);
    expect(isNotFound(new Error('404'))).toBe(false);
  });
});
