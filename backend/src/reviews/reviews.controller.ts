import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { CreateReviewDto } from './dto/review.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('reviews')
@ApiBearerAuth()
@Controller('requests')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post(':id/review')
  @ApiCreatedResponse({
    description: 'Reseña verificada de un trabajo COMPLETED; se recalcula el rating. No cambia el estado.',
  })
  @ApiConflictResponse({ description: 'REVIEW_NOT_ALLOWED | REVIEW_ALREADY_EXISTS' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviews.create(user.userId, id, dto);
  }
}
