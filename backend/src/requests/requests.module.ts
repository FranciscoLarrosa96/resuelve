import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfessionalGuard } from '../common/auth/professional.guard';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { QuotesModule } from '../quotes/quotes.module';
import { ProRequestsService } from './pro-requests.service';
import { RequestInvitation } from './request-invitation.entity';
import { ProRequestsController, RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { ServiceRequest } from './service-request.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceRequest, RequestInvitation, ProfessionalProfile]), QuotesModule],
  controllers: [RequestsController, ProRequestsController],
  providers: [RequestsService, ProRequestsService, ProfessionalGuard],
  exports: [RequestsService, ProRequestsService],
})
export class RequestsModule {}
