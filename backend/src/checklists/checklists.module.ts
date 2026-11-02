import { Module } from '@nestjs/common';
import { CardChecklistsController, ChecklistsController } from './checklists.controller.js';
import { ChecklistsService } from './checklists.service.js';

@Module({
  controllers: [CardChecklistsController, ChecklistsController],
  providers: [ChecklistsService],
})
export class ChecklistsModule {}
