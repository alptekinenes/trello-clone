import { fileHeaders } from './file-headers.js';

const base = { fileName: 'a.png', size: 12, download: false, maxAgeSeconds: 420 };

describe('fileHeaders', () => {
  it('shows an image inline and locks it down', () => {
    const headers = fileHeaders({ ...base, mimeType: 'image/png' });

    expect(headers).toMatchObject({
      'Content-Type': 'image/png',
      'Content-Length': '12',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'Cache-Control': 'private, max-age=420',
      'Accept-Ranges': 'none',
    });
    expect(headers['Content-Disposition']).toMatch(/^inline; /);
  });

  it('downloads an image when asked to, and always downloads everything else', () => {
    const forced = fileHeaders({ ...base, mimeType: 'image/png', download: true });
    expect(forced['Content-Disposition']).toMatch(/^attachment; /);
    for (const mimeType of ['application/pdf', 'application/zip', 'text/plain', 'image/svg+xml']) {
      expect(fileHeaders({ ...base, mimeType })['Content-Disposition']).toMatch(/^attachment; /);
    }
  });

  it('adds a charset to text types only', () => {
    expect(fileHeaders({ ...base, mimeType: 'text/csv' })['Content-Type']).toBe(
      'text/csv; charset=utf-8',
    );
    expect(fileHeaders({ ...base, mimeType: 'application/pdf' })['Content-Type']).toBe(
      'application/pdf',
    );
  });

  it('never gives a negative max-age', () => {
    const headers = fileHeaders({ ...base, mimeType: 'image/png', maxAgeSeconds: -5 });
    expect(headers['Cache-Control']).toBe('private, max-age=0');
  });
});
