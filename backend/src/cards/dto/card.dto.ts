import {
  type CardAnchors,
  CARD_LIMITS,
  type CreateCardRequest,
  type MoveCardRequest,
  type UpdateCardRequest,
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

/** Anchors may be omitted or null; both mean "no neighbour on that side". */
export class CardAnchorsDto implements CardAnchors {
  @IsOptional()
  @IsUUID()
  afterCardId?: string | null;

  @IsOptional()
  @IsUUID()
  beforeCardId?: string | null;
}

export class CreateCardDto extends CardAnchorsDto implements CreateCardRequest {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(CARD_LIMITS.TITLE_MAX)
  title: string;
}

/** Both fields are optional, but null is rejected. */
export class UpdateCardDto implements UpdateCardRequest {
  @ValidateIf((_, value) => value !== undefined)
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(CARD_LIMITS.TITLE_MAX)
  title?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  archived?: boolean;
}

export class MoveCardDto extends CardAnchorsDto implements MoveCardRequest {
  @IsUUID()
  listId: string;
}
