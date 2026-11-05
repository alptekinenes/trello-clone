import { Module } from '@nestjs/common';
import { CardFeedService } from './card-feed.service.js';
import { CardCommentsController, CommentsController } from './comments.controller.js';
import { CommentsService } from './comments.service.js';

@Module({
  controllers: [CardCommentsController, CommentsController],
  providers: [CommentsService, CardFeedService],
})
export class CommentsModule {}
