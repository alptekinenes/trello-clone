import {
  type CardAnchors,
  CARD_LIMITS,
  type CreateCardRequest,
  LABEL_COLORS,
  type LabelColor,
  type MoveCardRequest,
  type UpdateCardRequest,
} from '@trello/contracts';
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateBy,
  ValidateIf,
} from 'class-validator';
import { BlankToNull } from '../../common/decorators/blank-to-null.decorator.js';
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

/** An ISO 8601 date-time that names its time zone: `Z` or `+hh:mm`. */
const ISO_DATETIME_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** UTC years a due date may fall in. A 5-digit year is stored, but Date cannot read it back. */
const DUE_YEARS = { MIN: 1970, MAX: 9999 } as const;

function IsDueYearSupported(): PropertyDecorator {
  return ValidateBy({
    name: 'isDueYearSupported',
    validator: {
      validate: (value: unknown) => {
        if (typeof value !== 'string') return false;
        const year = new Date(value).getUTCFullYear();
        return year >= DUE_YEARS.MIN && year <= DUE_YEARS.MAX;
      },
      defaultMessage: () =>
        `dueDate must fall between the years ${DUE_YEARS.MIN} and ${DUE_YEARS.MAX} in UTC`,
    },
  });
}

/** A cover is a color or an image, never both; null only clears its own kind. */
function IsNotWithCoverColor(): PropertyDecorator {
  return ValidateBy({
    name: 'isNotWithCoverColor',
    validator: {
      validate: (_value: unknown, args) =>
        (args?.object as UpdateCardRequest | undefined)?.coverColor == null,
      defaultMessage: () => 'coverAttachmentId and coverColor cannot both be set',
    },
  });
}

/**
 * Every field is optional. Null is rejected, except for `description` and
 * `dueDate` and `coverColor`, where it clears the value.
 */
export class UpdateCardDto implements UpdateCardRequest {
  @ValidateIf((_, value) => value !== undefined)
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(CARD_LIMITS.TITLE_MAX)
  title?: string;

  /** Trimmed; blank becomes null. */
  @BlankToNull()
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(CARD_LIMITS.DESCRIPTION_MAX)
  description?: string | null;

  /** Without a time zone the server would guess its own, so that is refused. */
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsISO8601({ strict: true })
  @Matches(ISO_DATETIME_WITH_ZONE, { message: 'dueDate must include a time zone (Z or +hh:mm)' })
  @IsDueYearSupported()
  dueDate?: string | null;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  dueComplete?: boolean;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  archived?: boolean;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isCompleted?: boolean;

  /** null removes the cover. */
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsIn(LABEL_COLORS)
  coverColor?: LabelColor | null;

  /** An image attachment of the card; null removes it. Not together with a non-null coverColor. */
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsUUID()
  @IsNotWithCoverColor()
  coverAttachmentId?: string | null;
}

export class MoveCardDto extends CardAnchorsDto implements MoveCardRequest {
  @IsUUID()
  listId: string;
}
