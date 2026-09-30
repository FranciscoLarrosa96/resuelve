import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfessionalGuard } from '../common/auth/professional.guard';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { Job, JobEvent } from './job.entity';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [TypeOrmModule.forFeature([Job, JobEvent, ProfessionalProfile])],
  controllers: [JobsController],
  providers: [JobsService, ProfessionalGuard],
  exports: [JobsService],
})
export class JobsModule {}
