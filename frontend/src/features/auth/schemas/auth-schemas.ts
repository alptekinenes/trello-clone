import { AUTH_LIMITS } from '@trello/contracts';
import { z } from 'zod';

const email = z
  .string()
  .trim()
  .min(1, { error: 'E-posta adresini gir.' })
  .max(AUTH_LIMITS.EMAIL_MAX, { error: 'E-posta adresi çok uzun.' })
  .pipe(z.email({ error: 'Geçerli bir e-posta adresi gir.' }));

const passwordTooLong = `Parola en fazla ${AUTH_LIMITS.PASSWORD_MAX} karakter olabilir.`;

export const loginSchema = z.object({
  email,
  password: z
    .string()
    .min(1, { error: 'Parolanı gir.' })
    .max(AUTH_LIMITS.PASSWORD_MAX, { error: passwordTooLong }),
});

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: 'Adını gir.' })
    .max(AUTH_LIMITS.NAME_MAX, { error: `Ad en fazla ${AUTH_LIMITS.NAME_MAX} karakter olabilir.` }),
  email,
  password: z
    .string()
    .min(AUTH_LIMITS.PASSWORD_MIN, {
      error: `Parola en az ${AUTH_LIMITS.PASSWORD_MIN} karakter olmalı.`,
    })
    .max(AUTH_LIMITS.PASSWORD_MAX, { error: passwordTooLong }),
});

export type LoginFormValues = z.input<typeof loginSchema>;
export type RegisterFormValues = z.input<typeof registerSchema>;
