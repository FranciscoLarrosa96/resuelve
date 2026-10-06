import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { ReportReviewDto } from './dto/review.dto';
import { ReviewReport } from './review-report.entity';
import { Review } from './review.entity';

@Injectable()
export class ReviewReportsService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Cualquier persona con cuenta puede reportar una reseña visible. No la oculta: la revisa un
   * administrador (`npm run reviews:moderation`). Idempotente por persona y reseña (un doble toque
   * o un segundo reporte no crea otro). No se puede reportar la propia reseña.
   */
  async report(userId: string, reviewId: string, dto: ReportReviewDto): Promise<{ reported: true }> {
    const review = await this.dataSource.getRepository(Review).findOne({
      where: { id: reviewId },
      select: { id: true, clientId: true, hiddenAt: true },
    });
    if (!review || review.hiddenAt) throw AppException.notFound('Reseña');
    if (review.clientId === userId) {
      throw AppException.conflict(ErrorCode.REVIEW_NOT_ALLOWED, 'No podés reportar tu propia reseña');
    }
    await this.dataSource
      .createQueryBuilder()
      .insert()
      .into(ReviewReport)
      .values({ reviewId, reporterId: userId, reason: dto.reason, details: dto.details || null })
      .orIgnore()
      .execute();
    return { reported: true };
  }
}
