import { COMMENT_LIMITS, type CommentBodyRequest, FEED_LIMITS } from '@trello/contracts';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';

/** Body of POST and PATCH. Trimmed at both ends; line breaks inside are kept. */
export class CommentBodyDto implements CommentBodyRequest {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(COMMENT_LIMITS.BODY_MAX)
  body: string;
}

export class FeedQueryDto {
  /** `true` adds the activity entries to the comments. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  details?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(FEED_LIMITS.PAGE_MAX)
  limit?: number;
}
