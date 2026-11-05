import { Module } from '@nestjs/common';
import { ActivityService } from './activity.service.js';

/** Card activity log. Modules that change cards import it and call `ActivityService.record`. */
@Module({
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
