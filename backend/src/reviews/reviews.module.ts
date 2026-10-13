import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfessionalGuard } from '../common/auth/professional.guard';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { ReviewRepliesController } from './review-replies.controller';
import { ReviewRepliesService } from './review-replies.service';
import { InvitedReviewsController } from './invited-reviews.controller';
import { InvitedReviewsService } from './invited-reviews.service';
import { ReviewModerationService } from './review-moderation.service';
import { ReviewReportsController } from './review-reports.controller';
import { ReviewReportsService } from './review-reports.service';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProfessionalProfile])],
  controllers: [ReviewsController, InvitedReviewsController, ReviewReportsController, ReviewRepliesController],
  providers: [
    ReviewsService,
    InvitedReviewsService,
    ReviewReportsService,
    ReviewModerationService,
    ReviewRepliesService,
    ProfessionalGuard,
  ],
  exports: [ReviewModerationService],
})
export class ReviewsModule {}
