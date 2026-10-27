import { BOARD_BACKGROUNDS, BOARD_LIMITS } from '@trello/contracts';
import { z } from 'zod';

export const boardTitleSchema = z
  .string()
  .trim()
  .min(1, { error: 'Pano adını gir.' })
  .max(BOARD_LIMITS.TITLE_MAX, {
    error: `Pano adı en fazla ${BOARD_LIMITS.TITLE_MAX} karakter olabilir.`,
  });

export const createBoardSchema = z.object({
  title: boardTitleSchema,
  background: z.enum(BOARD_BACKGROUNDS),
});

export type CreateBoardFormValues = z.input<typeof createBoardSchema>;
