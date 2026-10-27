/** Field limits shared by backend validation and frontend forms. */
export const AUTH_LIMITS = {
  EMAIL_MAX: 254,
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 128,
  NAME_MAX: 100,
  AVATAR_URL_MAX: 2048,
} as const;

export interface UserDto {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

/** Body of register, login and refresh responses. The refresh token travels in an httpOnly cookie. */
export interface AuthResponse {
  accessToken: string;
  user: UserDto;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface UpdateMeRequest {
  name?: string;
  avatarUrl?: string | null;
}
