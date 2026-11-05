import { ATTACHMENT_LIMITS, ErrorCode } from '@trello/contracts';
import { ApiError } from '../../../shared/lib/http';
import { formatFileSize } from '../../../shared/lib/file-size';

export const tooLargeMessage = (fileName: string): string =>
  `“${fileName}” ${formatFileSize(ATTACHMENT_LIMITS.MAX_BYTES)}'tan büyük, yüklenemedi.`;

export const unsupportedMessage = (fileName: string): string => `“${fileName}” türü desteklenmiyor.`;

export const LIMIT_MESSAGE = `Bir karta en fazla ${ATTACHMENT_LIMITS.MAX_PER_CARD} dosya eklenebilir.`;

export const UPLOAD_CANCELLED_MESSAGE = 'Yükleme iptal edildi.';

/** What a failed upload of `fileName` tells the user. */
export function uploadErrorMessage(error: unknown, fileName: string): string {
  if (error instanceof ApiError) {
    if (error.status === 413 || error.code === ErrorCode.PAYLOAD_TOO_LARGE) return tooLargeMessage(fileName);
    if (error.status === 415 || error.code === ErrorCode.UNSUPPORTED_FILE_TYPE) {
      return unsupportedMessage(fileName);
    }
    if (error.code === ErrorCode.ATTACHMENT_LIMIT_REACHED) return LIMIT_MESSAGE;
    if (error.status === 429) return 'Çok fazla yükleme yapıldı. Biraz bekleyip tekrar dene.';
    if (error.status === 404) return 'Kart bulunamadı. Silinmiş olabilir.';
  }
  return `“${fileName}” yüklenemedi. Tekrar dene.`;
}
