import { invitationRateLimit } from '../config/env.validation.js';

/** Spam and registered-address probing protection, per client IP and route. */
export const INVITATION_THROTTLE = { default: { limit: invitationRateLimit, ttl: 60_000 } };
