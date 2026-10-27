import { plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsString, Max, Min, MinLength, validateSync } from 'class-validator';

export const DEFAULT_AUTH_RATE_LIMIT = 10;

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

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
}

/**
 * Read lazily by the throttler on each credential request. The value was
 * validated at startup; the fallback only covers it being unset.
 */
export function authRateLimit(): number {
  const value = Number(process.env.AUTH_RATE_LIMIT_PER_MINUTE);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_AUTH_RATE_LIMIT;
}

/** Validates process env on startup; the app refuses to boot with a bad config. */
export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config, { enableImplicitConversion: true });
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length > 0) {
    const problems = errors.map(
      (e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
    );
    throw new Error(`Invalid environment variables:\n- ${problems.join('\n- ')}`);
  }
  return env;
}
