import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { ThrottleCreate } from '../common/throttle';
import { ReportReviewDto } from './dto/review.dto';
import { ReviewReportsService } from './review-reports.service';

@ApiTags('reviews')
@ApiBearerAuth()
@Controller('reviews')
export class ReviewReportsController {
  constructor(private readonly reports: ReviewReportsService) {}

  @ThrottleCreate()
  @HttpCode(200)
  @Post(':id/report')
  @ApiOkResponse({ description: '{ reported: true }. No oculta la reseña: la revisa un administrador.' })
  report(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportReviewDto,
  ) {
    return this.reports.report(user.userId, id, dto);
  }
}
