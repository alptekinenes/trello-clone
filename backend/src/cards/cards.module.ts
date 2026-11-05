import { Module } from '@nestjs/common';
import { CardMembersController, CardWatchController } from './card-members.controller.js';
import { CardMembersService } from './card-members.service.js';
import { CardWatchService } from './card-watch.service.js';
import { BoardCardsController, CardsController, ListCardsController } from './cards.controller.js';
import { CardsService } from './cards.service.js';

@Module({
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
