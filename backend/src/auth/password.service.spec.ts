import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes with argon2id and never returns the plain password', async () => {
    const result = await service.hash('correct horse battery');
    expect(result).toMatch(/^\$argon2id\$/);
    expect(result).not.toContain('correct horse battery');
  });

  it('produces a different hash for the same password (random salt)', async () => {
    const [a, b] = await Promise.all([service.hash('same-password'), service.hash('same-password')]);
    expect(a).not.toBe(b);
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const stored = await service.hash('correct horse battery');
    await expect(service.verify(stored, 'correct horse battery')).resolves.toBe(true);
    await expect(service.verify(stored, 'wrong password')).resolves.toBe(false);
  });

  it('returns false instead of throwing for a malformed hash', async () => {
    await expect(service.verify('not-a-hash', 'anything')).resolves.toBe(false);
  });

  it('always fails the dummy check', async () => {
    await expect(service.verifyAgainstDummy('dummy-password-for-constant-time-login')).resolves.toBe(
      false,
    );
  });
});
