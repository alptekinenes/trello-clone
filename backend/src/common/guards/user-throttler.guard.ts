import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { RequestWithUser } from '../decorators/current-user.decorator.js';

/**
 * Rate limit per signed-in user instead of per IP. The global throttler runs before
 * authentication and cannot know the user; a guard on the route runs after JwtAuthGuard.
 * Falls back to the IP when the request has no user.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const user = (req as RequestWithUser).user;
    const ip = typeof req.ip === 'string' ? req.ip : 'unknown';
    return Promise.resolve(user ? `user:${user.id}` : ip);
  }
}
