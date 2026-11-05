import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { AttachmentsController, CardAttachmentsController } from './attachments.controller.js';
import { AttachmentsService } from './attachments.service.js';

@Module({
  imports: [ActivityModule, StorageModule],
  controllers: [CardAttachmentsController, AttachmentsController],
  providers: [AttachmentsService],
})
export class AttachmentsModule {}
