import {
  BOARD_BACKGROUNDS,
  BOARD_LIMITS,
  type BoardBackground,
  type CreateBoardRequest,
  type UpdateBoardRequest,
} from '@trello/contracts';
import { IsIn, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';

export class CreateBoardDto implements CreateBoardRequest {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(BOARD_LIMITS.TITLE_MAX)
  title: string;

  /** Optional, but null is rejected (the column is not nullable). */
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(BOARD_BACKGROUNDS)
  background?: BoardBackground;
}

/** Both fields are optional, but null is rejected: a board always has a title and background. */
export class UpdateBoardDto implements UpdateBoardRequest {
  @ValidateIf((_, value) => value !== undefined)
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(BOARD_LIMITS.TITLE_MAX)
  title?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn(BOARD_BACKGROUNDS)
  background?: BoardBackground;
}
