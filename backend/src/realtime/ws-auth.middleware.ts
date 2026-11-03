import { REALTIME_UNAUTHORIZED } from '@trello/contracts';
import type { ExtendedError } from 'socket.io';
import type { TokenService } from '../auth/token.service.js';
import type { RealtimeSocket } from './realtime.types.js';

type Next = (error?: ExtendedError) => void;

function unauthorized(): ExtendedError {
  return Object.assign(new Error(REALTIME_UNAUTHORIZED), { data: { code: REALTIME_UNAUTHORIZED } });
}

/** The access token from the handshake `auth` payload. `query` is not accepted: URLs end up in logs. */
function tokenFromHandshake(socket: RealtimeSocket): string | null {
  const auth: unknown = socket.handshake.auth;
  if (typeof auth !== 'object' || auth === null) return null;
  const token = (auth as Record<string, unknown>).token;
  return typeof token === 'string' && token !== '' ? token : null;
}

async function authenticate(
  tokens: Pick<TokenService, 'verifyAccessTokenWithExpiry'>,
  socket: RealtimeSocket,
): Promise<void> {
  const token = tokenFromHandshake(socket);
  if (!token) throw unauthorized();
  const { user, expiresAt } = await tokens.verifyAccessTokenWithExpiry(token);
  socket.data.user = user;
  socket.data.expiresAt = expiresAt;
  socket.data.roomSeq = 0;
}

/**
 * Namespace middleware: only a valid access token gets a connection.
 * The token is never logged. Whether the user still exists is not checked
 * (the HTTP guard does not either); board access is checked at `board:join`.
 */
export function createWsAuthMiddleware(
  tokens: Pick<TokenService, 'verifyAccessTokenWithExpiry'>,
): (socket: RealtimeSocket, next: Next) => void {
  return (socket, next) => {
    authenticate(tokens, socket).then(
      () => next(),
      () => next(unauthorized()),
    );
  };
}
