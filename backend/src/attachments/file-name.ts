import { ATTACHMENT_LIMITS } from '@trello/contracts';

const FALLBACK_NAME = 'dosya';

/** C0 and C1 control characters, bidi marks and embeddings, and the isolates (U+2066 to U+2069). */
const UNSAFE_CHARACTERS = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/gu;

/** Keeps the extension when the name is too long. */
function shorten(name: string, max: number): string {
  if ([...name].length <= max) return name;
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 && name.length - dot <= 16 ? name.slice(dot) : '';
  const stem = [...name.slice(0, extension ? dot : name.length)];
  return stem.slice(0, max - [...extension].length).join('') + extension;
}

/**
 * A display name safe to store and show: NFC, no directories, no control or bidi characters,
 * collapsed spaces, at most 255 characters. It is never part of a storage path.
 */
export function cleanFileName(raw: string): string {
  const base = raw.normalize('NFC').split(/[/\\]/).pop() ?? '';
  const cleaned = base.replace(UNSAFE_CHARACTERS, '').replace(/\s+/gu, ' ').trim();
  const shortened = shorten(cleaned, ATTACHMENT_LIMITS.FILE_NAME_MAX);
  return shortened === '' ? FALLBACK_NAME : shortened;
}
