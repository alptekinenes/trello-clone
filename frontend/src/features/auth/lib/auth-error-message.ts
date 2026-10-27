import { ErrorCode } from '@trello/contracts';
import { ApiError } from '../../../shared/lib/http';

/** Turkish message for a failed login or registration. */
export function authErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case ErrorCode.INVALID_CREDENTIALS:
        return 'E-posta veya parola hatalı.';
      case ErrorCode.EMAIL_TAKEN:
        return 'Bu e-posta adresiyle kayıtlı bir hesap zaten var.';
      case ErrorCode.TOO_MANY_REQUESTS:
        return 'Çok fazla deneme yaptın. Bir dakika bekleyip tekrar dene.';
      case ErrorCode.VALIDATION_FAILED:
        return 'Bilgileri kontrol edip tekrar dene.';
      default:
        break;
    }
    if (error.status >= 500) {
      return 'Sunucuya şu an ulaşılamıyor. Biraz sonra tekrar dene.';
    }
  }
  return 'Bir şeyler ters gitti. Lütfen tekrar dene.';
}
