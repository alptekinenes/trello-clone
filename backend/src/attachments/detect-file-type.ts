import { ATTACHMENT_MIME_TYPES, type AttachmentMimeType } from '@trello/contracts';
import { isUtf8 } from 'node:buffer';
import { fileTypeFromBuffer } from 'file-type';

const ACCEPTED: ReadonlySet<string> = new Set(ATTACHMENT_MIME_TYPES);

/** Plain-text types have no magic bytes; the extension picks among them and the content is checked. */
const TEXT_TYPES: Readonly<Record<string, AttachmentMimeType>> = {
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.md': 'text/markdown',
};

function isAccepted(mime: string): mime is AttachmentMimeType {
  return ACCEPTED.has(mime);
}

/** Tab, line feed and carriage return are the only control characters text may contain. */
function isPlainText(buffer: Buffer): boolean {
  if (!isUtf8(buffer)) return false;
  for (const byte of buffer) {
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) return false;
  }
  return true;
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot < 0 ? '' : fileName.slice(dot).toLowerCase();
}

/**
 * The type decided from the file's content, never from what the client claimed.
 * null means the file is empty or not on the allow list (SVG, HTML, XML, legacy Office and executables included).
 */
export async function detectFileType(
  buffer: Buffer,
  fileName: string,
): Promise<AttachmentMimeType | null> {
  if (buffer.length === 0) return null;
  const detected = await fileTypeFromBuffer(buffer);
  if (detected) return isAccepted(detected.mime) ? detected.mime : null;
  const textType = TEXT_TYPES[extensionOf(fileName)];
  return textType && isPlainText(buffer) ? textType : null;
}
