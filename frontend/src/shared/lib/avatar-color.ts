/** Full class names, so Tailwind can find them in the source. */
export const AVATAR_COLOR_CLASS = [
  'bg-avatar-1 text-on-avatar',
  'bg-avatar-2 text-on-avatar',
  'bg-avatar-3 text-on-avatar',
  'bg-avatar-4 text-on-avatar',
  'bg-avatar-5 text-on-avatar',
  'bg-avatar-6 text-on-avatar',
  'bg-avatar-7 text-on-avatar',
  'bg-avatar-8 text-on-avatar',
] as const;

/** Deterministic palette index (FNV-1a hash) of a user id or name. */
export function avatarColorIndex(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % AVATAR_COLOR_CLASS.length;
}

export function avatarColorClass(seed: string): string {
  return AVATAR_COLOR_CLASS[avatarColorIndex(seed)] ?? AVATAR_COLOR_CLASS[0];
}
