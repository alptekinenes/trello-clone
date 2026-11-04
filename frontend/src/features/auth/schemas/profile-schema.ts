import { AUTH_LIMITS, type UpdateMeRequest } from '@trello/contracts';
import { z } from 'zod';

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: 'Adını gir.' })
    .max(AUTH_LIMITS.NAME_MAX, { error: `Ad en fazla ${AUTH_LIMITS.NAME_MAX} karakter olabilir.` }),
  /** Empty means "no avatar". */
  avatarUrl: z
    .string()
    .trim()
    .max(AUTH_LIMITS.AVATAR_URL_MAX, {
      error: `Adres en fazla ${AUTH_LIMITS.AVATAR_URL_MAX} karakter olabilir.`,
    })
    .refine((value) => value === '' || isHttpsUrl(value), {
      error: 'https:// ile başlayan geçerli bir adres gir.',
    }),
});

export type ProfileFormValues = z.input<typeof profileSchema>;

export function toUpdateMeRequest(values: ProfileFormValues): UpdateMeRequest {
  const avatarUrl = values.avatarUrl.trim();
  return { name: values.name.trim(), avatarUrl: avatarUrl === '' ? null : avatarUrl };
}
