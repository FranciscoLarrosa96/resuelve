import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfessionalGuard } from '../common/auth/professional.guard';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { RequestsModule } from '../requests/requests.module';
import {
  AppointmentsController,
  ProAppointmentsController,
  RequestCompletionController,
} from './appointments.controller';
import { AppointmentsService } from './appointments.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProfessionalProfile]), RequestsModule],
  controllers: [AppointmentsController, ProAppointmentsController, RequestCompletionController],
  providers: [AppointmentsService, ProfessionalGuard],
})
export class AppointmentsModule {}
