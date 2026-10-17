import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminGuard } from '../../common/auth/admin.guard';
import { ProfessionalGuard } from '../../common/auth/professional.guard';
import { ProfessionalProfile } from '../../professionals/professional-profile.entity';
import { User } from '../../users/user.entity';
import { VerificationsModule } from '../../verifications/verifications.module';
import { BillingModule } from '../billing.module';
import { AdminTransfersController } from './admin-transfers.controller';
import { TransferController } from './transfer.controller';
import { TransferScheduler } from './transfer-scheduler.service';
import { TransferService } from './transfer.service';
import { WithdrawalRequestsController } from './withdrawal-requests.controller';
import { WithdrawalRequestsService } from './withdrawal-requests.service';

/** Resuelve PRO por transferencia (prepago, confirmado por un admin). */
@Module({
  imports: [BillingModule, VerificationsModule, TypeOrmModule.forFeature([ProfessionalProfile, User])],
  controllers: [TransferController, AdminTransfersController, WithdrawalRequestsController],
  providers: [TransferService, WithdrawalRequestsService, TransferScheduler, ProfessionalGuard, AdminGuard],
  exports: [TransferService],
})
export class TransferModule {}
