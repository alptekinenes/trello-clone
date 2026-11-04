import {
  apiRateLimit,
  authRateLimit,
  invitationRateLimit,
  NodeEnv,
  trustProxyHops,
  validateEnv,
} from './env.validation.js';

const validEnv = {
  NODE_ENV: 'development',
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
    expect(env.APP_URL).toBe('http://localhost:5173');
    expect(env.INVITATION_RATE_LIMIT_PER_MINUTE).toBe(30);
    expect(env.API_RATE_LIMIT_PER_MINUTE).toBe(300);
    expect(env.TRUST_PROXY).toBe(0);
  });

  it('requires NODE_ENV and has no default for it', () => {
    expect(() => validateEnv({ ...validEnv, NODE_ENV: undefined })).toThrow(/NODE_ENV/);
    expect(() => validateEnv({ ...validEnv, NODE_ENV: '' })).toThrow(/NODE_ENV/);
  });

  it.each(['prod', 'staging', 'Production'])('rejects NODE_ENV %j', (value) => {
    expect(() => validateEnv({ ...validEnv, NODE_ENV: value })).toThrow(/NODE_ENV/);
  });

  it.each(['development', 'test', 'production'])('accepts NODE_ENV %j', (value) => {
    const env = validateEnv({ ...validEnv, NODE_ENV: value, APP_URL: 'https://app.example.com' });
    expect(env.NODE_ENV).toBe(value);
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

describe('invitation settings', () => {
  it('strips trailing slashes from APP_URL', () => {
    expect(validateEnv({ ...validEnv, APP_URL: 'https://app.example.com//' }).APP_URL).toBe(
      'https://app.example.com',
    );
  });

  it('accepts a hostname without a TLD (localhost)', () => {
    expect(validateEnv({ ...validEnv, APP_URL: 'http://localhost:4173' }).APP_URL).toBe(
      'http://localhost:4173',
    );
  });

  it('requires APP_URL in production but keeps the localhost default elsewhere', () => {
    const production = { ...validEnv, NODE_ENV: 'production' };

    expect(() => validateEnv(production)).toThrow(/APP_URL: must be set in production/);
    expect(() => validateEnv({ ...production, APP_URL: '  ' })).toThrow(/APP_URL/);
    expect(validateEnv({ ...production, APP_URL: 'https://app.example.com' }).APP_URL).toBe(
      'https://app.example.com',
    );
    expect(validateEnv({ ...validEnv, NODE_ENV: 'test' }).APP_URL).toBe('http://localhost:5173');
    expect(validateEnv({ ...validEnv, NODE_ENV: 'development' }).APP_URL).toBe(
      'http://localhost:5173',
    );
  });

  it.each(['not a url','ftp://example.com', 'example.com', 'javascript:alert(1)'])(
    'rejects APP_URL %j',
    (value) => {
      expect(() => validateEnv({ ...validEnv, APP_URL: value })).toThrow(/APP_URL/);
    },
  );

  it('rejects an out-of-range invitation rate limit', () => {
    expect(() => validateEnv({ ...validEnv, INVITATION_RATE_LIMIT_PER_MINUTE: '0' })).toThrow(
      /INVITATION_RATE_LIMIT_PER_MINUTE/,
    );
    expect(() => validateEnv({ ...validEnv, INVITATION_RATE_LIMIT_PER_MINUTE: '10001' })).toThrow(
      /INVITATION_RATE_LIMIT_PER_MINUTE/,
    );
  });
});

describe('invitationRateLimit', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads the limit from the environment', () => {
    vi.stubEnv('INVITATION_RATE_LIMIT_PER_MINUTE', '3');
    expect(invitationRateLimit()).toBe(3);
  });

  it('falls back to 30 when unset or invalid', () => {
    vi.stubEnv('INVITATION_RATE_LIMIT_PER_MINUTE', '');
    expect(invitationRateLimit()).toBe(30);
    vi.stubEnv('INVITATION_RATE_LIMIT_PER_MINUTE', 'abc');
    expect(invitationRateLimit()).toBe(30);
  });
});

describe('API rate limit', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('parses the limit and rejects out-of-range values', () => {
    expect(validateEnv({ ...validEnv, API_RATE_LIMIT_PER_MINUTE: '500' }).API_RATE_LIMIT_PER_MINUTE).toBe(
      500,
    );
    for (const value of ['0', '-1', '100001', 'abc', '1.5']) {
      expect(() => validateEnv({ ...validEnv, API_RATE_LIMIT_PER_MINUTE: value })).toThrow(
        /API_RATE_LIMIT_PER_MINUTE/,
      );
    }
  });

  it('reads the limit lazily and falls back to 300 when unset or invalid', () => {
    vi.stubEnv('API_RATE_LIMIT_PER_MINUTE', '42');
    expect(apiRateLimit()).toBe(42);
    vi.stubEnv('API_RATE_LIMIT_PER_MINUTE', '');
    expect(apiRateLimit()).toBe(300);
    vi.stubEnv('API_RATE_LIMIT_PER_MINUTE', 'abc');
    expect(apiRateLimit()).toBe(300);
  });
});

describe('TRUST_PROXY', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('parses hop counts from 0 to 10', () => {
    expect(validateEnv({ ...validEnv, TRUST_PROXY: '0' }).TRUST_PROXY).toBe(0);
    expect(validateEnv({ ...validEnv, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
    expect(validateEnv({ ...validEnv, TRUST_PROXY: '10' }).TRUST_PROXY).toBe(10);
  });

  it.each(['-1', '11', '1.5', 'abc', 'true'])('rejects %j', (value) => {
    expect(() => validateEnv({ ...validEnv, TRUST_PROXY: value })).toThrow(/TRUST_PROXY/);
  });

  it('reads the hop count lazily and treats unset or invalid as 0', () => {
    vi.stubEnv('TRUST_PROXY', '2');
    expect(trustProxyHops()).toBe(2);
    vi.stubEnv('TRUST_PROXY', '');
    expect(trustProxyHops()).toBe(0);
    vi.stubEnv('TRUST_PROXY', 'abc');
    expect(trustProxyHops()).toBe(0);
  });
});
