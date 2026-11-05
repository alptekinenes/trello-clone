import { cleanFileName } from './file-name.js';

describe('cleanFileName', () => {
  it('drops directories, however they are written', () => {
    expect(cleanFileName('../../x.txt')).toBe('x.txt');
    expect(cleanFileName('C:\\a\\b.txt')).toBe('b.txt');
    expect(cleanFileName('/etc/passwd')).toBe('passwd');
  });

  it('removes control and bidi characters', () => {
    expect(cleanFileName('a\u0000b\u0007c.txt')).toBe('abc.txt');
    expect(cleanFileName('rapor\u202egnp.exe')).toBe('raporgnp.exe');
    expect(cleanFileName('a\u200eb\u2066c\u2069.pdf')).toBe('abc.pdf');
  });

  it('normalizes to NFC and collapses whitespace', () => {
    expect(cleanFileName('Sirket\u0307 raporu.pdf')).toBe('Sirket\u0307 raporu.pdf'.normalize('NFC'));
    expect(cleanFileName('  a \t  b  .txt ')).toBe('a b .txt');
    expect(cleanFileName('u\u0308.txt')).toBe('\u00fc.txt');
  });

  it('shortens a long name to 255 characters and keeps the extension', () => {
    const cleaned = cleanFileName(`${'a'.repeat(300)}.pdf`);
    expect([...cleaned]).toHaveLength(255);
    expect(cleaned.endsWith('.pdf')).toBe(true);
  });

  it('falls back to a default for an empty name', () => {
    expect(cleanFileName('')).toBe('dosya');
    expect(cleanFileName('  \u0000 ')).toBe('dosya');
    expect(cleanFileName('a/')).toBe('dosya');
  });
});
