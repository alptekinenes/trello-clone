import { INestApplication } from '@nestjs/common';
import type { UserDto } from '@trello/contracts';
import { TokenService } from '../../src/auth/token.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { normalizeEmail } from '../../src/users/users.service.js';

export interface TestUser {
  user: UserDto;
  /** Value for the Authorization header. */
  auth: string;
}

let counter = 0;

/**
 * Inserts a user directly and signs an access token for them.
 * Skips argon2 and the register rate limit, so tests stay fast.
 * Pass `email` to create the user under a specific address (it is normalized like in production).
 */
export async function createUser(
  app: INestApplication,
  name = 'Test Kullanıcı',
  email?: string,
): Promise<TestUser> {
  counter += 1;
  const user = await app.get(PrismaService).user.create({
    data: {
      email: email ? normalizeEmail(email) : `user-${Date.now()}-${counter}@example.com`,
      name,
      passwordHash: 'unused',
    },
    select: { id: true, email: true, name: true, avatarUrl: true },
  });
  const token = await app.get(TokenService).signAccessToken(user);
  return { user, auth: `Bearer ${token}` };
}
