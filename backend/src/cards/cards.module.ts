import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module.js';
import { ActivityModule } from '../activity/activity.module.js';
import { CardMembersController, CardWatchController } from './card-members.controller.js';
import { CardMembersService } from './card-members.service.js';
import { CardWatchService } from './card-watch.service.js';
import { BoardCardsController, CardsController, ListCardsController } from './cards.controller.js';
import { CardsService } from './cards.service.js';

@Module({
  imports: [ActivityModule, StorageModule],
  controllers: [
    BoardCardsController,
    ListCardsController,
    CardsController,
    CardMembersController,
    CardWatchController,
  ],
  providers: [CardsService, CardMembersService, CardWatchService],
})
export class CardsModule {}
