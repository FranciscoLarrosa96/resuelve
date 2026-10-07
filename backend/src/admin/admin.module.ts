import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminGuard } from '../common/auth/admin.guard';
import { AccountModule } from '../account/account.module';
import { BillingModule } from '../billing/billing.module';
import { User } from '../users/user.entity';
import { PlansModule } from '../plans/plans.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { VerificationsModule } from '../verifications/verifications.module';
import { AdminPricingController } from './admin-pricing.controller';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { AdminReportsController } from './admin-reports.controller';
import { AdminVerificationsController } from './admin-verifications.controller';

@Module({
  imports: [AccountModule, BillingModule, VerificationsModule, ReviewsModule, PlansModule, TypeOrmModule.forFeature([User])],
  controllers: [AdminVerificationsController, AdminReportsController, AdminPricingController, AdminUsersController],
  providers: [AdminGuard, AdminUsersService],
})
export class AdminModule {}
