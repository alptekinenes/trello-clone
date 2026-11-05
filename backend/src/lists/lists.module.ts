import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module.js';
import { BoardListsController, ListsController } from './lists.controller.js';
import { ListsService } from './lists.service.js';

@Module({
  imports: [StorageModule],
  controllers: [BoardListsController, ListsController],
  providers: [ListsService],
})
export class ListsModule {}
