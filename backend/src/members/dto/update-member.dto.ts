import {
  ASSIGNABLE_BOARD_ROLES,
  type AssignableBoardRole,
  type UpdateMemberRequest,
} from '@trello/contracts';
import { IsIn } from 'class-validator';

export class UpdateMemberDto implements UpdateMemberRequest {
  /** OWNER is not assignable; ownership transfer is out of scope. */
  @IsIn(ASSIGNABLE_BOARD_ROLES)
  role: AssignableBoardRole;
}
