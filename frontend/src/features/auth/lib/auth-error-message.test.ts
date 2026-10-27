import { ErrorCode } from '@trello/contracts';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../shared/lib/http';
import { authErrorMessage } from './auth-error-message';

function apiError(status: number, code: ErrorCode) {
  return new ApiError(status, { statusCode: status, code, message: 'x', path: '/', timestamp: '' });
}

describe('authErrorMessage', () => {
  it.each([
    [apiError(401, ErrorCode.INVALID_CREDENTIALS), 'E-posta veya parola hatalı.'],
    [apiError(409, ErrorCode.EMAIL_TAKEN), 'Bu e-posta adresiyle kayıtlı bir hesap zaten var.'],
    [apiError(429, ErrorCode.TOO_MANY_REQUESTS), 'Çok fazla deneme yaptın. Bir dakika bekleyip tekrar dene.'],
    [apiError(400, ErrorCode.VALIDATION_FAILED), 'Bilgileri kontrol edip tekrar dene.'],
    [new ApiError(502, null), 'Sunucuya şu an ulaşılamıyor. Biraz sonra tekrar dene.'],
    [new TypeError('Failed to fetch'), 'Bir şeyler ters gitti. Lütfen tekrar dene.'],
  ])('maps %o', (error, expected) => {
    expect(authErrorMessage(error)).toBe(expected);
  });
});
