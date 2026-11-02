import {
  type CreateLabelRequest,
  LABEL_COLORS,
  LABEL_LIMITS,
  type LabelColor,
  type UpdateLabelRequest,
} from '@trello/contracts';
import { IsIn, IsString, MaxLength, ValidateIf } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';

/** The name may be empty (a color-only label), but null is rejected. */
export class CreateLabelDto implements CreateLabelRequest {
  @ValidateIf((_, value) => value !== undefined)
  @Trim()
  @IsString()
  @MaxLength(LABEL_LIMITS.NAME_MAX)
  name?: string;

  @IsIn(LABEL_COLORS)
  color: LabelColor;
}

/** Both fields are optional, but null is rejected. */
export class UpdateLabelDto implements UpdateLabelRequest {
  @ValidateIf((_, value) => value !== undefined)
  @Trim()
  @IsString()
  @MaxLength(LABEL_LIMITS.NAME_MAX)
  name?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn(LABEL_COLORS)
  color?: LabelColor;
}
