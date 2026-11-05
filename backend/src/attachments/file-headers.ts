import { isInlineImage } from '@trello/contracts';
import { contentDisposition } from './content-disposition.js';

export interface FileHeaderInput {
  mimeType: string;
  fileName: string;
  size: number;
  download: boolean;
  /** Seconds the browser may keep the file (the rest of the key's validity). */
  maxAgeSeconds: number;
}

/**
 * Response headers for a stored file. The type comes from the database (found from the content
 * at upload), never from the client. Only png, jpeg, gif and webp are ever shown inline; the
 * sandboxing CSP and `nosniff` keep anything else from running as part of the app's origin.
 */
export function fileHeaders(input: FileHeaderInput): Record<string, string> {
  const inline = isInlineImage(input.mimeType) && !input.download;
  return {
    'Content-Type': input.mimeType.startsWith('text/')
      ? `${input.mimeType}; charset=utf-8`
      : input.mimeType,
    'Content-Disposition': contentDisposition(input.fileName, inline),
    'Content-Length': String(input.size),
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    'Cache-Control': `private, max-age=${Math.max(0, input.maxAgeSeconds)}`,
    // Range requests are not supported: files are at most 10 MB and none is audio or video.
    'Accept-Ranges': 'none',
  };
}
