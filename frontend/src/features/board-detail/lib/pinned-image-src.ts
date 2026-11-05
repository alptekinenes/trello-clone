/**
 * The first `src` an image used, per attachment. The file key changes every few minutes,
 * and a new URL would download the same picture again; keeping the first one lets the
 * browser answer from its cache for as long as the page lives.
 */
const pinned = new Map<string, string>();

export function pinnedImageSrc(attachmentId: string, candidate: string): string {
  const existing = pinned.get(attachmentId);
  if (existing !== undefined) return existing;
  pinned.set(attachmentId, candidate);
  return candidate;
}

/** The pinned URL stopped working (its key expired): the next render pins a fresh one. */
export function unpinImageSrc(attachmentId: string): void {
  pinned.delete(attachmentId);
}

/** Test helper. */
export function resetPinnedImageSrc(): void {
  pinned.clear();
}
