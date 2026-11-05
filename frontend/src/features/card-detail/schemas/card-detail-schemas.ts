import { CARD_LIMITS, CHECKLIST_LIMITS, COMMENT_LIMITS } from '@trello/contracts';
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

export const checklistTitleSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, { error: 'Checklist başlığını gir.' })
    .max(CHECKLIST_LIMITS.TITLE_MAX, {
      error: `Başlık en fazla ${CHECKLIST_LIMITS.TITLE_MAX} karakter olabilir.`,
    }),
});

export type ChecklistTitleFormValues = z.input<typeof checklistTitleSchema>;

export const checklistItemSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, { error: 'Öğe metnini gir.' })
    .max(CHECKLIST_LIMITS.ITEM_CONTENT_MAX, {
      error: `Öğe en fazla ${CHECKLIST_LIMITS.ITEM_CONTENT_MAX} karakter olabilir.`,
    }),
});

export type ChecklistItemFormValues = z.input<typeof checklistItemSchema>;

export const commentBodySchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, { error: 'Yorum boş olamaz.' })
    .max(COMMENT_LIMITS.BODY_MAX, {
      error: `Yorum en fazla ${COMMENT_LIMITS.BODY_MAX} karakter olabilir.`,
    }),
});

export type CommentFormValues = z.input<typeof commentBodySchema>;
export type CommentFormOutput = z.output<typeof commentBodySchema>;
