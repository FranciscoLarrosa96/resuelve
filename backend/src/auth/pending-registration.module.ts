import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Zone } from '../catalog/zone.entity';
import { EmailModule } from '../email/email.module';
import { User } from '../users/user.entity';
import { PendingRegistration } from './pending-registration.entity';
import { PendingRegistrationService } from './pending-registration.service';

@Module({
  imports: [TypeOrmModule.forFeature([PendingRegistration, User, Zone]), EmailModule],
  providers: [PendingRegistrationService],
  exports: [PendingRegistrationService],
})
export class PendingRegistrationModule {}
