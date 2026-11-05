import {
  DOCX_MINIMAL,
  GIF_MINIMAL,
  HTML_AS_PNG,
  JPEG_MINIMAL,
  MZ_EXECUTABLE,
  ODT_MINIMAL,
  PDF_MINIMAL,
  PNG_1X1,
  SVG_IMAGE,
  WEBP_MINIMAL,
  makeZip,
} from '../../test/utils/files.js';
import { detectFileType } from './detect-file-type.js';

describe('detectFileType', () => {
  it.each([
    ['PNG', PNG_1X1, 'image/png'],
    ['JPEG', JPEG_MINIMAL, 'image/jpeg'],
    ['GIF', GIF_MINIMAL, 'image/gif'],
    ['WebP', WEBP_MINIMAL, 'image/webp'],
    ['PDF', PDF_MINIMAL, 'application/pdf'],
    [
      'DOCX',
      DOCX_MINIMAL,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    ['ODT', ODT_MINIMAL, 'application/vnd.oasis.opendocument.text'],
    ['zip', makeZip({ 'a.txt': 'merhaba' }), 'application/zip'],
  ])('detects %s from the content, whatever the name says', async (_label, buffer, expected) => {
    await expect(detectFileType(buffer, 'yanlis-ad.bin')).resolves.toBe(expected);
  });

  it.each([
    ['not.txt', 'text/plain'],
    ['liste.CSV', 'text/csv'],
    ['notlar.md', 'text/markdown'],
  ])('accepts UTF-8 text named %s', async (name, expected) => {
    await expect(detectFileType(Buffer.from('Şirket raporu\r\n\tçğıöşü'), name)).resolves.toBe(
      expected,
    );
  });

  it('rejects HTML named .png, an executable named .pdf and SVG', async () => {
    await expect(detectFileType(HTML_AS_PNG, 'a.png')).resolves.toBeNull();
    await expect(detectFileType(MZ_EXECUTABLE, 'a.pdf')).resolves.toBeNull();
    await expect(detectFileType(SVG_IMAGE, 'a.svg')).resolves.toBeNull();
    await expect(detectFileType(SVG_IMAGE, 'a.txt')).resolves.toBe('text/plain');
  });

  it('rejects text with NUL or other control characters and invalid UTF-8', async () => {
    await expect(detectFileType(Buffer.from('a\u0000b'), 'a.txt')).resolves.toBeNull();
    await expect(detectFileType(Buffer.from('a\u0007b'), 'a.csv')).resolves.toBeNull();
    await expect(detectFileType(Buffer.from([0xc3, 0x28]), 'a.md')).resolves.toBeNull();
  });

  it('rejects text under an extension that is not a text type', async () => {
    await expect(detectFileType(Buffer.from('merhaba'), 'a.html')).resolves.toBeNull();
    await expect(detectFileType(Buffer.from('merhaba'), 'noextension')).resolves.toBeNull();
  });

  it('rejects an empty file', async () => {
    await expect(detectFileType(Buffer.alloc(0), 'a.txt')).resolves.toBeNull();
  });
});
