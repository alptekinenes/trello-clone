import { Module } from '@nestjs/common';
import {
  ChecklistItemsController,
  ChecklistItemsCreateController,
} from './checklist-items.controller.js';
import { ChecklistItemsService } from './checklist-items.service.js';
import { CardChecklistsController, ChecklistsController } from './checklists.controller.js';
import { ChecklistsService } from './checklists.service.js';

@Module({
  controllers: [
    CardChecklistsController,
    ChecklistsController,
    ChecklistItemsCreateController,
    ChecklistItemsController,
  ],
  providers: [ChecklistsService, ChecklistItemsService],
})
export class ChecklistsModule {}
