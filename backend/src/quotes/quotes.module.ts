import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfessionalGuard } from '../common/auth/professional.guard';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { QuotesController, ProQuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProfessionalProfile])],
  controllers: [QuotesController, ProQuotesController],
  providers: [QuotesService, ProfessionalGuard],
  exports: [QuotesService],
})
export class QuotesModule {}
