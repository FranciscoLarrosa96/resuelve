import { Module } from '@nestjs/common';
import { DemandAlertsController } from './demand-alerts.controller';
import { DemandAlertsScheduler } from './demand-alerts.scheduler';

@Module({
  controllers: [DemandAlertsController],
  providers: [DemandAlertsScheduler],
  exports: [DemandAlertsScheduler],
})
export class DemandAlertsModule {}
