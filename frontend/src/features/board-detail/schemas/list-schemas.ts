import { LIST_LIMITS } from '@trello/contracts';
import { z } from 'zod';

export const listTitleSchema = z
  .string()
  .trim()
  .min(1, { error: 'Liste adını gir.' })
  .max(LIST_LIMITS.TITLE_MAX, {
    error: `Liste adı en fazla ${LIST_LIMITS.TITLE_MAX} karakter olabilir.`,
  });

export const addListSchema = z.object({ title: listTitleSchema });

export type AddListFormValues = z.input<typeof addListSchema>;
