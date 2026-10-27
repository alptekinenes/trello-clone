import {
  type CreateListRequest,
  LIST_LIMITS,
  type MoveListRequest,
  type UpdateListRequest,
} from '@trello/contracts';
import { Transform } from 'class-transformer';
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
export class ListAnchorsDto implements MoveListRequest {
  @IsOptional()
  @IsUUID()
  afterListId?: string | null;

  @IsOptional()
  @IsUUID()
  beforeListId?: string | null;
}

export class CreateListDto extends ListAnchorsDto implements CreateListRequest {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(LIST_LIMITS.TITLE_MAX)
  title: string;
}

/** Both fields are optional, but null is rejected. */
export class UpdateListDto implements UpdateListRequest {
  @ValidateIf((_, value) => value !== undefined)
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(LIST_LIMITS.TITLE_MAX)
  title?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  archived?: boolean;
}

/** `?archived=true` lists the archive instead of the board. */
export class ListQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  archived?: boolean;
}
