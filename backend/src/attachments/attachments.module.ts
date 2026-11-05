import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module.js';
import { StorageModule } from '../storage/storage.module.js';
import {
  AttachmentsController,
  CardAttachmentsController,
  FilesController,
  FileTokenController,
} from './attachments.controller.js';
import { AttachmentsService } from './attachments.service.js';
import { FileAccessService } from './file-access.service.js';

@Module({
  imports: [ActivityModule, StorageModule],
  controllers: [
    CardAttachmentsController,
    AttachmentsController,
    FileTokenController,
    FilesController,
  ],
  providers: [AttachmentsService, FileAccessService],
})
export class AttachmentsModule {}
