import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfessionalGuard } from '../common/auth/professional.guard';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { FunnelController } from './funnel.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ProfessionalProfile])],
  controllers: [FunnelController],
  providers: [ProfessionalGuard],
})
export class FunnelModule {}
