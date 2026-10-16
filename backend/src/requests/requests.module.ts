import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfessionalGuard } from '../common/auth/professional.guard';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { QuotesModule } from '../quotes/quotes.module';
import { InvitationOptionsService } from './invitation-options.service';
import { ProRequestsService } from './pro-requests.service';
import { RequestInvitation } from './request-invitation.entity';
import { ProRequestsController, RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { ClientRequestQuestionsController, ProRequestQuestionsController } from './questions/request-questions.controller';
import { RequestQuestionsService } from './questions/request-questions.service';
import { ServiceRequest } from './service-request.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceRequest, RequestInvitation, ProfessionalProfile]), QuotesModule],
  controllers: [RequestsController, ProRequestsController, ProRequestQuestionsController, ClientRequestQuestionsController],
  providers: [RequestsService, InvitationOptionsService, ProRequestsService, RequestQuestionsService, ProfessionalGuard],
  exports: [RequestsService, ProRequestsService],
})
export class RequestsModule {}
