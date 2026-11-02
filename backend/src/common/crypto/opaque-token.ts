import { createHash, randomBytes } from 'node:crypto';

const DEFAULT_TOKEN_BYTES = 32;

/** A random, URL-safe secret (base64url; 43 characters for 32 bytes). */
export function newOpaqueToken(bytes: number = DEFAULT_TOKEN_BYTES): string {
  return randomBytes(bytes).toString('base64url');
}

/** The only form of an opaque token that is stored: its sha256 hash as hex. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
