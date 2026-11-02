import {
  CHECKLIST_LIMITS,
  type ChecklistAnchors,
  type CreateChecklistItemRequest,
  type CreateChecklistRequest,
  type MoveChecklistItemRequest,
  type UpdateChecklistItemRequest,
  type UpdateChecklistRequest,
} from '@trello/contracts';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
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

export class CreateChecklistItemDto implements CreateChecklistItemRequest {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(CHECKLIST_LIMITS.ITEM_CONTENT_MAX)
  content: string;
}

/** Both fields are optional, but null is rejected. */
export class UpdateChecklistItemDto implements UpdateChecklistItemRequest {
  @ValidateIf((_, value) => value !== undefined)
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(CHECKLIST_LIMITS.ITEM_CONTENT_MAX)
  content?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isCompleted?: boolean;
}

/** Anchors may be omitted or null; both mean "no neighbour on that side". */
export class MoveChecklistItemDto implements MoveChecklistItemRequest {
  @IsUUID()
  checklistId: string;

  @IsOptional()
  @IsUUID()
  afterItemId?: string | null;

  @IsOptional()
  @IsUUID()
  beforeItemId?: string | null;
}
