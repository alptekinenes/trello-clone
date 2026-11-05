import { UserThrottlerGuard } from './user-throttler.guard.js';

class Probe extends UserThrottlerGuard {
  tracker(req: Record<string, unknown>): Promise<string> {
    return this.getTracker(req);
  }
}

describe('UserThrottlerGuard', () => {
  const probe = Object.create(Probe.prototype) as Probe;

  it('tracks a signed-in request by user, not by IP', async () => {
    await expect(probe.tracker({ user: { id: 'u1' }, ip: '1.2.3.4' })).resolves.toBe('user:u1');
  });

  it('falls back to the IP without a user', async () => {
    await expect(probe.tracker({ ip: '1.2.3.4' })).resolves.toBe('1.2.3.4');
    await expect(probe.tracker({})).resolves.toBe('unknown');
  });
});
