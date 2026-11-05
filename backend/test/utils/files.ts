import { crc32 } from 'node:zlib';

/** Small in-memory fixtures; no binary files are committed. */
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

export const JPEG_MINIMAL = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);

export const GIF_MINIMAL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

export const WEBP_MINIMAL = Buffer.from(
  'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==',
  'base64',
);

export const PDF_MINIMAL = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

export const HTML_AS_PNG = Buffer.from('<!doctype html><script>alert(1)</script>');

export const SVG_IMAGE = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><script>alert(1)</script></svg>',
);

/** A Windows executable header ("MZ"). */
export const MZ_EXECUTABLE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64, 0x90)]);

/** A zip made of stored (uncompressed) entries, enough for content sniffing. */
export function makeZip(entries: Record<string, string>): Buffer {
  const parts: Buffer[] = [];
  for (const [name, content] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name);
    const data = Buffer.from(content);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(crc32(data), 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    parts.push(header, nameBytes, data);
  }
  return Buffer.concat(parts);
}

const WORD_MAIN = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';

export const DOCX_MINIMAL = makeZip({
  '[Content_Types].xml': `<Types><Override PartName="/word/document.xml" ContentType="${WORD_MAIN}"/></Types>`,
  'word/document.xml': '<w:document/>',
});

export const ODT_MINIMAL = makeZip({ mimetype: 'application/vnd.oasis.opendocument.text' });

/** Bytes of the given size that pass as plain text. */
export function textOfSize(size: number): Buffer {
  return Buffer.alloc(size, 'a');
}
