import { Global, Module } from '@nestjs/common';
import { BoardAccessGuard } from './board-access.guard.js';
import { BoardAccessService } from './board-access.service.js';

/** Board authorization, available to every feature module. */
@Global()
@Module({
  providers: [BoardAccessService, BoardAccessGuard],
  exports: [BoardAccessService, BoardAccessGuard],
})
export class AccessModule {}
