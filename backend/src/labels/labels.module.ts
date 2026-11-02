import { Module } from '@nestjs/common';
import {
  BoardLabelsController,
  CardLabelsController,
  LabelsController,
} from './labels.controller.js';
import { LabelsService } from './labels.service.js';

@Module({
  controllers: [BoardLabelsController, LabelsController, CardLabelsController],
  providers: [LabelsService],
})
export class LabelsModule {}
