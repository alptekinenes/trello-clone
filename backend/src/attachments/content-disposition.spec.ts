import { contentDisposition } from './content-disposition.js';

describe('contentDisposition', () => {
  it('gives an ASCII fallback and an RFC 5987 name for a Turkish file name', () => {
    expect(contentDisposition('Şirket raporu (son).pdf', false)).toBe(
      `attachment; filename="Sirket raporu (son).pdf"; filename*=UTF-8''%C5%9Eirket%20raporu%20%28son%29.pdf`,
    );
  });

  it('simplifies every Turkish letter, upper and lower case', () => {
    const header = contentDisposition('çğıöşü ÇĞİÖŞÜ.txt', false);
    expect(header).toContain('filename="cgiosu CGIOSU.txt"');
  });

  it('replaces quotes, backslashes, control and other non-ASCII characters', () => {
    const header = contentDisposition('a"b\\c\u0001dé中.txt', false);
    expect(header).toContain('filename="a_b_c_d__.txt"');
  });

  it('encodes quote-like characters in the extended name', () => {
    expect(contentDisposition("a'b(c)*.txt", false)).toContain(
      "filename*=UTF-8''a%27b%28c%29%2A.txt",
    );
  });

  it('says inline or attachment', () => {
    expect(contentDisposition('a.png', true)).toMatch(/^inline; /);
    expect(contentDisposition('a.png', false)).toMatch(/^attachment; /);
  });

  it('cannot be turned into a second header or parameter by the name', () => {
    const header = contentDisposition('a.png";\r\nSet-Cookie: x=1', true);
    expect(header).not.toMatch(/[\r\n]/);
    expect(header).toMatch(/^inline; filename="[^"\\]*"; filename\*=UTF-8''[A-Za-z0-9%._-]*$/);
  });
});
