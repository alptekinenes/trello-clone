import {
  CHECKLIST_LIMITS,
  type ChecklistAnchors,
  type CreateChecklistRequest,
  type UpdateChecklistRequest,
} from '@trello/contracts';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';

export class CreateChecklistDto implements CreateChecklistRequest {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(CHECKLIST_LIMITS.TITLE_MAX)
  title: string;
}

export class UpdateChecklistDto implements UpdateChecklistRequest {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(CHECKLIST_LIMITS.TITLE_MAX)
  title: string;
}

/** Anchors may be omitted or null; both mean "no neighbour on that side". */
export class ChecklistAnchorsDto implements ChecklistAnchors {
  @IsOptional()
  @IsUUID()
  afterChecklistId?: string | null;

  @IsOptional()
  @IsUUID()
  beforeChecklistId?: string | null;
}
