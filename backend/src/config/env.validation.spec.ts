import { authRateLimit, NodeEnv, validateEnv } from './env.validation.js';

const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('validateEnv', () => {
  it('accepts a valid env and applies defaults', () => {
    const env = validateEnv(validEnv);
    expect(env.NODE_ENV).toBe(NodeEnv.Development);
    expect(env.PORT).toBe(3000);
    expect(env.CORS_ORIGIN).toBe('http://localhost:5173');
    expect(env.JWT_ACCESS_TTL_SECONDS).toBe(900);
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(7);
    expect(env.AUTH_RATE_LIMIT_PER_MINUTE).toBe(10);
  });

  it('rejects a zero auth rate limit', () => {
    expect(() => validateEnv({ ...validEnv, AUTH_RATE_LIMIT_PER_MINUTE: '0' })).toThrow(
      /AUTH_RATE_LIMIT_PER_MINUTE/,
    );
  });

  it('rejects an access token lifetime below one minute', () => {
    expect(() => validateEnv({ ...validEnv, JWT_ACCESS_TTL_SECONDS: '10' })).toThrow(
      /JWT_ACCESS_TTL_SECONDS/,
    );
  });

  it('converts PORT from string to number', () => {
    expect(validateEnv({ ...validEnv, PORT: '4000' }).PORT).toBe(4000);
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => validateEnv({ JWT_ACCESS_SECRET: 'x'.repeat(32) })).toThrow(/DATABASE_URL/);
  });

  it('rejects a short JWT secret', () => {
    expect(() => validateEnv({ ...validEnv, JWT_ACCESS_SECRET: 'short' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });
});

describe('authRateLimit', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads the limit from the environment', () => {
    vi.stubEnv('AUTH_RATE_LIMIT_PER_MINUTE', '250');
    expect(authRateLimit()).toBe(250);
  });

  it('falls back to 10 when unset or invalid', () => {
    vi.stubEnv('AUTH_RATE_LIMIT_PER_MINUTE', '');
    expect(authRateLimit()).toBe(10);
    vi.stubEnv('AUTH_RATE_LIMIT_PER_MINUTE', 'abc');
    expect(authRateLimit()).toBe(10);
  });
});
