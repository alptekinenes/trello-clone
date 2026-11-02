import { CARD_LIMITS } from '@trello/contracts';
import { z } from 'zod';
import { fromDateTimeLocalValue } from '../../../shared/lib/date';

export const descriptionSchema = z.object({
  description: z
    .string()
    .trim()
    .max(CARD_LIMITS.DESCRIPTION_MAX, {
      error: `Açıklama en fazla ${CARD_LIMITS.DESCRIPTION_MAX} karakter olabilir.`,
    }),
});

export type DescriptionFormValues = z.input<typeof descriptionSchema>;
export type DescriptionFormOutput = z.output<typeof descriptionSchema>;

export const dueDateSchema = z.object({
  dueDate: z
    .string()
    .min(1, { error: 'Bir tarih ve saat seç.' })
    .refine((value) => fromDateTimeLocalValue(value) !== null, { error: 'Geçerli bir tarih gir.' }),
});

export type DueDateFormValues = z.infer<typeof dueDateSchema>;
