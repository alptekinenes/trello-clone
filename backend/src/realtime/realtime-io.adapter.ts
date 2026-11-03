import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { REALTIME_PATH } from '@trello/contracts';
import { Server, type ServerOptions } from 'socket.io';

/** The only client messages are board:join and board:leave, so a small limit is plenty. */
const MAX_MESSAGE_BYTES = 16_384;

/** Socket.io server settings shared by production and e2e tests. */
export class RealtimeIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly corsOrigin: string,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    // Nest types its options as a complete ServerOptions but passes only the gateway's own settings.
    const merged = {
      ...options,
      path: REALTIME_PATH,
      // WebSocket only: no long-polling, so a later multi-server setup needs no sticky sessions.
      transports: ['websocket'],
      cors: { origin: this.corsOrigin, credentials: true },
      maxHttpBufferSize: MAX_MESSAGE_BYTES,
      serveClient: false,
    } as ServerOptions;
    return super.createIOServer(port, merged);
  }
}
