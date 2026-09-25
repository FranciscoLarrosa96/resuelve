import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfessionalGuard } from '../common/auth/professional.guard';
import { Review } from '../reviews/review.entity';
import { ProfessionalProfile } from './professional-profile.entity';
import { ProfessionalsController, ProProfileController } from './professionals.controller';
import { ProfessionalsService } from './professionals.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProfessionalProfile, Review])],
  controllers: [ProfessionalsController, ProProfileController],
  providers: [ProfessionalsService, ProfessionalGuard],
  exports: [ProfessionalsService],
})
export class ProfessionalsModule {}
