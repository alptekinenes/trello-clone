import { plainToInstance, Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export const DEFAULT_AUTH_RATE_LIMIT = 10;
export const DEFAULT_INVITATION_RATE_LIMIT = 30;
export const DEFAULT_API_RATE_LIMIT = 300;

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  /** Required and without a default: it decides cookie `secure` and invitation-link logging. */
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  CORS_ORIGIN: string = 'http://localhost:5173';

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET: string;

  /** Access token lifetime. Kept short; the refresh token renews it. */
  @IsInt()
  @Min(60)
  @Max(86_400)
  JWT_ACCESS_TTL_SECONDS: number = 900;

  @IsInt()
  @Min(1)
  @Max(90)
  REFRESH_TOKEN_TTL_DAYS: number = 7;

  /** Login/register attempts per client IP per minute. Raise it locally for e2e runs. */
  @IsInt()
  @Min(1)
  @Max(10_000)
  AUTH_RATE_LIMIT_PER_MINUTE: number = DEFAULT_AUTH_RATE_LIMIT;

  /**
   * Public address of the frontend; the base of invitation links. Trailing slashes are
   * dropped. Defaults to the local dev server; production must set it (see `validateEnv`).
   */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/\/+$/, '') : value,
  )
  @IsUrl({ require_tld: false, protocols: ['http', 'https'], require_protocol: true })
  APP_URL: string = 'http://localhost:5173';

  /** Invitation create/preview/accept requests per client IP per minute (per route). */
  @IsInt()
  @Min(1)
  @Max(10_000)
  INVITATION_RATE_LIMIT_PER_MINUTE: number = DEFAULT_INVITATION_RATE_LIMIT;

  /** Default requests per client IP per minute for every route without a stricter limit. */
  @IsInt()
  @Min(1)
  @Max(100_000)
  API_RATE_LIMIT_PER_MINUTE: number = DEFAULT_API_RATE_LIMIT;

  /**
   * Number of reverse proxies in front of the app whose `X-Forwarded-For` hops are trusted.
   * 0 ignores the header; behind one proxy (nginx, a load balancer) set 1 so the rate limiter
   * sees the real client IP instead of the proxy's.
   */
  @IsInt()
  @Min(0)
  @Max(10)
  TRUST_PROXY: number = 0;
}

/**
 * Read lazily by the throttler on each credential request. The value was
 * validated at startup; the fallback only covers it being unset.
 */
export function authRateLimit(): number {
  const value = Number(process.env.AUTH_RATE_LIMIT_PER_MINUTE);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_AUTH_RATE_LIMIT;
}

/** Same lazy read as `authRateLimit`, for the invitation routes. */
export function invitationRateLimit(): number {
  const value = Number(process.env.INVITATION_RATE_LIMIT_PER_MINUTE);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_INVITATION_RATE_LIMIT;
}

/** Same lazy read as `authRateLimit`, for the default limit applied to every route. */
export function apiRateLimit(): number {
  const value = Number(process.env.API_RATE_LIMIT_PER_MINUTE);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_API_RATE_LIMIT;
}

/** Lazy read of `TRUST_PROXY` (validated at startup); 0 when unset or invalid. */
export function trustProxyHops(): number {
  const value = Number(process.env.TRUST_PROXY);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

/** The class defaults hide a missing value, so required-in-production checks look at the raw input. */
function isSet(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

const PLACEHOLDER_SECRET_PREFIX = 'change-me';

/** True for a bare http(s) origin such as https://app.example.com (no path, wildcard or list). */
function isSingleOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
  } catch {
    return false;
  }
}

/** Production-only rules: values whose development defaults must never reach a live deployment. */
function productionProblems(config: Record<string, unknown>): string[] {
  const problems: string[] = [];
  if (!isSet(config.APP_URL)) {
    problems.push('APP_URL: must be set in production (invitation links are built from it)');
  }
  const origin = typeof config.CORS_ORIGIN === 'string' ? config.CORS_ORIGIN.trim() : '';
  if (origin === '') {
    problems.push(
      'CORS_ORIGIN: must be set in production (the localhost default is for development)',
    );
  } else if (!isSingleOrigin(origin)) {
    problems.push(
      'CORS_ORIGIN: must be a single http(s) origin without a path, e.g. https://app.example.com',
    );
  }
  const secret = config.JWT_ACCESS_SECRET;
  if (typeof secret === 'string' && secret.toLowerCase().startsWith(PLACEHOLDER_SECRET_PREFIX)) {
    problems.push('JWT_ACCESS_SECRET: must not be the placeholder from .env.example');
  }
  return problems;
}

/** Validates process env on startup; the app refuses to boot with a bad config. */
export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config, { enableImplicitConversion: true });
  const errors = validateSync(env, { skipMissingProperties: false });
  const problems = errors.map(
    (e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
  );
  if (env.NODE_ENV === NodeEnv.Production) problems.push(...productionProblems(config));
  if (problems.length > 0) {
    throw new Error(`Invalid environment variables:\n- ${problems.join('\n- ')}`);
  }
  return env;
}
