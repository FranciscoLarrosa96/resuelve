import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminGuard } from '../common/auth/admin.guard';
import { User } from '../users/user.entity';
import { PlansModule } from '../plans/plans.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { VerificationsModule } from '../verifications/verifications.module';
import { AdminPricingController } from './admin-pricing.controller';
import { AdminReportsController } from './admin-reports.controller';
import { AdminVerificationsController } from './admin-verifications.controller';

@Module({
  imports: [VerificationsModule, ReviewsModule, PlansModule, TypeOrmModule.forFeature([User])],
  controllers: [AdminVerificationsController, AdminReportsController, AdminPricingController],
  providers: [AdminGuard],
})
export class AdminModule {}
