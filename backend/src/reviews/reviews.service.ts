import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { recalculateProfessionalMetrics } from '../professionals/professional-metrics';
import { assertTransition } from '../requests/request-state-machine';
import { RequestStatus } from '../requests/request.enums';
import { ServiceRequest } from '../requests/service-request.entity';
import { CreateReviewDto } from './dto/review.dto';
import { assertCanReview } from './review-eligibility';
import { Review } from './review.entity';

@Injectable()
export class ReviewsService {
  constructor(private readonly dataSource: DataSource) {}

  /** Crea la reseña, cierra la solicitud y recalcula el rating del profesional (todo o nada). */
  async create(clientId: string, requestId: string, dto: CreateReviewDto) {
    try {
      const review = await this.dataSource.transaction(async (m) => {
        const request = await m.findOne(ServiceRequest, {
          where: { id: requestId },
          lock: { mode: 'pessimistic_write' },
        });
        const alreadyReviewed = request ? await m.existsBy(Review, { requestId }) : false;
        assertCanReview(request, clientId, alreadyReviewed);
        assertTransition(request.status as RequestStatus, RequestStatus.CLOSED);

        const saved = await m.save(
          m.create(Review, {
            requestId,
            professionalId: request.selectedProfessionalId,
            clientId,
            rating: dto.rating,
            comment: dto.comment || null,
            verifiedWork: true,
          }),
        );
        await m.update(ServiceRequest, requestId, { status: RequestStatus.CLOSED });
        await recalculateProfessionalMetrics(m, request.selectedProfessionalId);
        return saved;
      });
      return {
        id: review.id,
        requestId: review.requestId,
        professionalId: review.professionalId,
        rating: review.rating,
        comment: review.comment,
        verifiedWork: review.verifiedWork,
        createdAt: review.createdAt,
      };
    } catch (e) {
      if ((e as { code?: string })?.code === '23505') {
        throw AppException.conflict(
          ErrorCode.REVIEW_ALREADY_EXISTS,
          'Ya dejaste una reseña para este trabajo',
        );
      }
      throw e;
    }
  }
}
