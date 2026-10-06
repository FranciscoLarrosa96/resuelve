import { Module } from '@nestjs/common';
import { InvitedReviewsController } from './invited-reviews.controller';
import { InvitedReviewsService } from './invited-reviews.service';
import { ReviewModerationService } from './review-moderation.service';
import { ReviewReportsController } from './review-reports.controller';
import { ReviewReportsService } from './review-reports.service';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  controllers: [ReviewsController, InvitedReviewsController, ReviewReportsController],
  providers: [ReviewsService, InvitedReviewsService, ReviewReportsService, ReviewModerationService],
})
export class ReviewsModule {}
