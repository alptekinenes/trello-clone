import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

/** Keys are valid for the rest of a 5 minute window plus one more: 5 to 10 minutes. */
const WINDOW_SECONDS = 300;
const MAX_LIFETIME_SECONDS = 2 * WINDOW_SECONDS;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNATURE_BYTES = 32;

export interface FileTokenClaims {
  boardId: string;
  userId: string;
}

/** The signing key, derived from the access token secret so no new secret has to be configured. */
export function deriveFileTokenKey(secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, '', 'trello-clone/file-token/v1', 32));
}

function sign(key: Buffer, claims: FileTokenClaims, exp: number): Buffer {
  return createHmac('sha256', key)
    .update(`file-token|${claims.boardId}|${claims.userId}|${exp}`)
    .digest();
}

/**
 * A key for reading the files of one board as one user. It is the same string for the whole
 * window, so the URLs built from it (and the browser cache) stay the same.
 */
export function signFileToken(
  key: Buffer,
  claims: FileTokenClaims,
  now: Date,
): { token: string; expiresAt: Date } {
  const exp = (Math.floor(now.getTime() / 1000 / WINDOW_SECONDS) + 2) * WINDOW_SECONDS;
  const signature = sign(key, claims, exp).toString('base64url');
  return {
    token: `${claims.boardId}.${claims.userId}.${exp}.${signature}`,
    expiresAt: new Date(exp * 1000),
  };
}

export interface VerifiedFileToken extends FileTokenClaims {
  expiresAt: Date;
}

/** The claims of a genuine, unexpired key, or null. Never throws and never touches the database. */
export function verifyFileToken(key: Buffer, token: string, now: Date): VerifiedFileToken | null {
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [boardId, userId, expText, signatureText] = parts;
  if (!UUID.test(boardId) || !UUID.test(userId) || !/^\d{1,12}$/.test(expText)) return null;

  const exp = Number(expText);
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (!(nowSeconds < exp && exp <= nowSeconds + MAX_LIFETIME_SECONDS)) return null;

  const given = Buffer.from(signatureText, 'base64url');
  if (given.length !== SIGNATURE_BYTES) return null;
  if (!timingSafeEqual(given, sign(key, { boardId, userId }, exp))) return null;
  return { boardId, userId, expiresAt: new Date(exp * 1000) };
}
