import { AUTH_LIMITS, type LoginRequest, type RegisterRequest } from '@trello/contracts';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';

export class RegisterDto implements RegisterRequest {
  @Trim()
  @IsEmail()
  @MaxLength(AUTH_LIMITS.EMAIL_MAX)
  email: string;

  @IsString()
  @MinLength(AUTH_LIMITS.PASSWORD_MIN)
  @MaxLength(AUTH_LIMITS.PASSWORD_MAX)
  password: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(AUTH_LIMITS.NAME_MAX)
  name: string;
}

export class LoginDto implements LoginRequest {
  @Trim()
  @IsEmail()
  @MaxLength(AUTH_LIMITS.EMAIL_MAX)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(AUTH_LIMITS.PASSWORD_MAX)
  password: string;
}
