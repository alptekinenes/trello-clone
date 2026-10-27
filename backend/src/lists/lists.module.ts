import { Module } from '@nestjs/common';
import { BoardListsController, ListsController } from './lists.controller.js';
import { ListsService } from './lists.service.js';

@Module({
  controllers: [BoardListsController, ListsController],
  providers: [ListsService],
})
export class ListsModule {}
