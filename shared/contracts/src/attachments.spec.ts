import { describe, expect, it } from 'vitest';
import type { BoardRole } from './enums.js';
import {
  ATTACHMENT_MIME_TYPES,
  canDeleteAttachment,
  fileUrlPath,
  INLINE_IMAGE_TYPES,
  isInlineImage,
} from './attachments.js';

describe('isInlineImage', () => {
  it.each(INLINE_IMAGE_TYPES)('shows %s inline', (type) => {
    expect(isInlineImage(type)).toBe(true);
  });

  it('never shows SVG, PDF or text inline', () => {
    expect(isInlineImage('image/svg+xml')).toBe(false);
    expect(isInlineImage('application/pdf')).toBe(false);
    expect(isInlineImage('text/plain')).toBe(false);
  });

  it('keeps every inline type in the accepted list', () => {
    for (const type of INLINE_IMAGE_TYPES) expect(ATTACHMENT_MIME_TYPES).toContain(type);
  });
});

describe('canDeleteAttachment', () => {
  const roles: BoardRole[] = ['OWNER', 'ADMIN', 'MEMBER'];

  it.each(roles)('lets a %s delete their own upload', (role) => {
    expect(canDeleteAttachment({ userId: 'a', role }, 'a')).toBe(true);
  });

  it('lets ADMIN and OWNER delete other uploads, not MEMBER', () => {
    expect(canDeleteAttachment({ userId: 'a', role: 'OWNER' }, 'b')).toBe(true);
    expect(canDeleteAttachment({ userId: 'a', role: 'ADMIN' }, 'b')).toBe(true);
    expect(canDeleteAttachment({ userId: 'a', role: 'MEMBER' }, 'b')).toBe(false);
  });
});

describe('fileUrlPath', () => {
  it('puts the id and the encoded key in the path and query', () => {
    expect(fileUrlPath('a1', 'b.c.d+/=')).toBe('/files/a1?token=b.c.d%2B%2F%3D');
  });

  it('adds download=true only when asked', () => {
    expect(fileUrlPath('a1', 'k', true)).toBe('/files/a1?token=k&download=true');
    expect(fileUrlPath('a1', 'k', false)).toBe('/files/a1?token=k');
  });
});
