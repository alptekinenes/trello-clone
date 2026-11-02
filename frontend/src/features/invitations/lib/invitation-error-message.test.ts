import type { ErrorCode } from '@trello/contracts';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../shared/lib/http';
import { invitationErrorMessage, isInvitationUnusable } from './invitation-error-message';

function apiError(status: number, code: ErrorCode) {
  return new ApiError(status, {
    statusCode: status,
    code,
    message: 'x',
    path: '/api/v1/x',
    timestamp: '2026-01-01T00:00:00.000Z',
  });
}

describe('invitationErrorMessage', () => {
  it.each([
    [404, 'NOT_FOUND', 'Davet bulunamadı. Bağlantı hatalı olabilir ya da davet yenilenmiş olabilir.'],
    [410, 'INVITATION_EXPIRED', 'Bu davetin süresi dolmuş. Seni davet eden kişiden yeni bir davet iste.'],
    [410, 'INVITATION_REVOKED', 'Bu davet iptal edilmiş.'],
    [410, 'INVITATION_USED', 'Bu davet zaten kullanılmış. Panoya erişimin varsa Panolarım sayfasında görebilirsin.'],
    [403, 'EMAIL_MISMATCH', 'Bu davet başka bir e-posta adresine gönderilmiş. Davet edilen adresle giriş yap.'],
  ] as const)('explains %i %s', (status, code, message) => {
    expect(invitationErrorMessage(apiError(status, code))).toBe(message);
  });

  it('falls back to the general messages', () => {
    expect(invitationErrorMessage(apiError(429, 'TOO_MANY_REQUESTS'))).toBe(
      'Çok fazla istek gönderildi. Biraz bekleyip tekrar dene.',
    );
    expect(invitationErrorMessage(new TypeError('network'))).toBe(
      'Bir şeyler ters gitti. Lütfen tekrar dene.',
    );
  });
});

describe('isInvitationUnusable', () => {
  it.each([403, 404, 410])('is true for %i', (status) => {
    expect(isInvitationUnusable(apiError(status, 'NOT_FOUND'))).toBe(true);
  });

  it.each([429, 500, 502])('is false for %i, which a retry may fix', (status) => {
    expect(isInvitationUnusable(apiError(status, 'INTERNAL_ERROR'))).toBe(false);
  });

  it('is false for a network failure', () => {
    expect(isInvitationUnusable(new TypeError('network'))).toBe(false);
  });
});
