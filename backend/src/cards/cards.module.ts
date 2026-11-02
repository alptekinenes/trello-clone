import { Module } from '@nestjs/common';
import { BoardCardsController, CardsController, ListCardsController } from './cards.controller.js';
import { CardsService } from './cards.service.js';

@Module({
  controllers: [BoardCardsController, ListCardsController, CardsController],
  providers: [CardsService],
})
export class CardsModule {}
