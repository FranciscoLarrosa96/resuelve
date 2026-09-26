import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfessionalGuard } from '../common/auth/professional.guard';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { ExposureController } from './exposure.controller';
import { ExposureService } from './exposure.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProfessionalProfile])],
  controllers: [AnalyticsController, ExposureController],
  providers: [AnalyticsService, ExposureService, ProfessionalGuard],
})
export class AnalyticsModule {}
