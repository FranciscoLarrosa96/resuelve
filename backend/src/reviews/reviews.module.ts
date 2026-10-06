import { Module } from '@nestjs/common';
import { InvitedReviewsController } from './invited-reviews.controller';
import { InvitedReviewsService } from './invited-reviews.service';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  controllers: [ReviewsController, InvitedReviewsController],
  providers: [ReviewsService, InvitedReviewsService],
})
export class ReviewsModule {}
