import { ASSIGNABLE_BOARD_ROLES } from '@trello/contracts';
import { z } from 'zod';
import { emailSchema } from '../../../shared/lib/email-schema';

export const inviteSchema = z.object({
  email: emailSchema,
  role: z.enum(ASSIGNABLE_BOARD_ROLES),
});

export type InviteFormValues = z.input<typeof inviteSchema>;
export type InviteFormOutput = z.output<typeof inviteSchema>;
