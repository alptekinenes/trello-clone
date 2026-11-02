import { CARD_LIMITS } from '@trello/contracts';
import { z } from 'zod';

export const cardTitleSchema = z
  .string()
  .trim()
  .min(1, { error: 'Kart başlığını gir.' })
  .max(CARD_LIMITS.TITLE_MAX, {
    error: `Kart başlığı en fazla ${CARD_LIMITS.TITLE_MAX} karakter olabilir.`,
  });

export const addCardSchema = z.object({ title: cardTitleSchema });

export type AddCardFormValues = z.input<typeof addCardSchema>;

/** "Kartı taşı": target list and 1-based position in it. */
export const moveCardSchema = z.object({
  listId: z.string().min(1, { error: 'Bir liste seç.' }),
  position: z.number().int().min(1),
});

export type MoveCardFormValues = z.infer<typeof moveCardSchema>;
