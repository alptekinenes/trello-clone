import {
  ASSIGNABLE_BOARD_ROLES,
  type AssignableBoardRole,
  AUTH_LIMITS,
  type CreateInvitationRequest,
} from '@trello/contracts';
import { IsEmail, IsIn, MaxLength } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';

export class CreateInvitationDto implements CreateInvitationRequest {
  @Trim()
  @IsEmail()
  @MaxLength(AUTH_LIMITS.EMAIL_MAX)
  email: string;

  @IsIn(ASSIGNABLE_BOARD_ROLES)
  role: AssignableBoardRole;
}
