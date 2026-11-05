import { FileInterceptor } from '@nestjs/platform-express';
import { ATTACHMENT_LIMITS } from '@trello/contracts';

/** The part of the multer file the service needs. Memory storage: `buffer` holds the whole file. */
export interface UploadedFileData {
  originalname: string;
  buffer: Buffer;
}

/**
 * Exactly one file in the `file` field and no other parts. No `storage` is given, so multer
 * keeps the file in memory (at most MAX_BYTES per request). `defParamCharset: 'utf8'` is needed
 * because browsers send UTF-8 names and multer assumes latin1.
 */
export const UploadInterceptor = FileInterceptor('file', {
  limits: {
    fileSize: ATTACHMENT_LIMITS.MAX_BYTES,
    files: 1,
    fields: 0,
    parts: 1,
    headerPairs: 20,
  },
  defParamCharset: 'utf8',
});
