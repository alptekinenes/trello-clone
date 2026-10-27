import { Injectable } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';

/** argon2id with the OWASP minimum recommendation (19 MiB, 2 iterations). */
const HASH_OPTIONS = {
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService {
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return hash(password, HASH_OPTIONS);
  }

  /** False for a wrong password or a malformed hash; never throws. */
  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  /**
   * Spends the same time as a real check when the email is unknown,
   * so response time does not reveal which emails are registered.
   */
  async verifyAgainstDummy(password: string): Promise<false> {
    this.dummyHash ??= this.hash('dummy-password-for-constant-time-login');
    await this.verify(await this.dummyHash, password);
    return false;
  }
}
