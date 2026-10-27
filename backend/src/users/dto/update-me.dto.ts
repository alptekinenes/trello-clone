import { AUTH_LIMITS, type UpdateMeRequest } from '@trello/contracts';
import { IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength, ValidateIf } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';

export class UpdateMeDto implements UpdateMeRequest {
  /** Optional, but null is rejected: a user always has a name. */
  @ValidateIf((_, value) => value !== undefined)
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(AUTH_LIMITS.NAME_MAX)
  name?: string;

  /** null removes the avatar. Only https URLs are accepted. */
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(AUTH_LIMITS.AVATAR_URL_MAX)
  avatarUrl?: string | null;
}
