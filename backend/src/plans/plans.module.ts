import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfessionalGuard } from '../common/auth/professional.guard';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { PlansController, ProPlanController } from './plans.controller';
import { ProOffersService } from './pro-offers.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProfessionalProfile])],
  controllers: [PlansController, ProPlanController],
  providers: [ProOffersService, ProfessionalGuard],
})
export class PlansModule {}
