import { LABEL_LIMITS, LabelColor } from '@trello/contracts';
import { z } from 'zod';

export const labelSchema = z.object({
  name: z
    .string()
    .trim()
    .max(LABEL_LIMITS.NAME_MAX, {
      error: `Etiket adı en fazla ${LABEL_LIMITS.NAME_MAX} karakter olabilir.`,
    }),
  color: z.enum(LabelColor, { error: 'Bir renk seç.' }),
});

export type LabelFormValues = z.input<typeof labelSchema>;
export type LabelFormOutput = z.output<typeof labelSchema>;
