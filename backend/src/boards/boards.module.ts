import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module.js';
import { BoardsController } from './boards.controller.js';
import { BoardsService } from './boards.service.js';

@Module({
  imports: [StorageModule],
  controllers: [BoardsController],
  providers: [BoardsService],
})
export class BoardsModule {}
