import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfessionalGuard } from '../common/auth/professional.guard';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { QuotesController, ProQuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { QuoteTemplatesController } from './templates/quote-templates.controller';
import { QuoteTemplatesService } from './templates/quote-templates.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProfessionalProfile])],
  controllers: [QuotesController, ProQuotesController, QuoteTemplatesController],
  providers: [QuotesService, QuoteTemplatesService, ProfessionalGuard],
  exports: [QuotesService],
})
export class QuotesModule {}
