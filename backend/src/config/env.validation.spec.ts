import { NodeEnv, validateEnv } from './env.validation.js';

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
