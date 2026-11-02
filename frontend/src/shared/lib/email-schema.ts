import { AUTH_LIMITS } from '@trello/contracts';
import { z } from 'zod';

/** An email address as typed: trimmed, present, not too long, well-formed. */
export const emailSchema = z
  .string()
  .trim()
  .min(1, { error: 'E-posta adresini gir.' })
  .max(AUTH_LIMITS.EMAIL_MAX, { error: 'E-posta adresi çok uzun.' })
  .pipe(z.email({ error: 'Geçerli bir e-posta adresi gir.' }));
