import { ErrorCode } from '@trello/contracts';
import { apiErrorMessage } from '../../../shared/lib/api-error-message';
import { ApiError } from '../../../shared/lib/http';

export const INVITATION_NOT_FOUND_MESSAGE =
  'Davet bulunamadı. Bağlantı hatalı olabilir ya da davet yenilenmiş olabilir.';

/** Turkish explanation of why an invitation could not be shown or accepted. */
export function invitationErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case ErrorCode.INVITATION_EXPIRED:
        return 'Bu davetin süresi dolmuş. Seni davet eden kişiden yeni bir davet iste.';
      case ErrorCode.INVITATION_REVOKED:
        return 'Bu davet iptal edilmiş.';
      case ErrorCode.INVITATION_USED:
        return 'Bu davet zaten kullanılmış. Panoya erişimin varsa Panolarım sayfasında görebilirsin.';
      case ErrorCode.EMAIL_MISMATCH:
        return 'Bu davet başka bir e-posta adresine gönderilmiş. Davet edilen adresle giriş yap.';
      default:
        if (error.status === 404) {
          return INVITATION_NOT_FOUND_MESSAGE;
        }
    }
  }
  return apiErrorMessage(error);
}

/** The invitation itself is unusable (as opposed to a hiccup that a retry may fix). */
export function isInvitationUnusable(error: unknown): boolean {
  return error instanceof ApiError && [403, 404, 410].includes(error.status);
}
