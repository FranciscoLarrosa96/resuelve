import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { recalculateProfessionalMetrics } from '../professionals/professional-metrics';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { FunnelEventType } from '../funnel/funnel-event.entity';
import { recordFunnelEvent } from '../funnel/funnel';
import { NotificationType } from '../notifications/notification.entity';
import { markNotificationsRead, notify } from '../notifications/notify';
import { ServiceRequest } from '../requests/service-request.entity';
import { CreateReviewDto } from './dto/review.dto';
import { assertCanReview } from './review-eligibility';
import { Review } from './review.entity';
import { presentOwnReview } from './review.presenter';

@Injectable()
export class ReviewsService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Crea la reseña y recalcula el rating del profesional (todo o nada). No
   * cambia el estado: la solicitud ya está COMPLETED y así queda, con o sin reseña.
   */
  async create(clientId: string, requestId: string, dto: CreateReviewDto) {
    try {
      const review = await this.dataSource.transaction(async (m) => {
        const request = await m.findOne(ServiceRequest, {
          where: { id: requestId },
          lock: { mode: 'pessimistic_write' },
        });
        const alreadyReviewed = request ? await m.existsBy(Review, { requestId }) : false;
        // El profesional sale SIEMPRE de la solicitud (el body no lo trae): nadie reseña a otro.
        const professional = request?.selectedProfessionalId
          ? await m.findOne(ProfessionalProfile, {
              where: { id: request.selectedProfessionalId },
              select: { id: true, userId: true },
            })
          : null;
        assertCanReview(request, clientId, alreadyReviewed, professional?.userId ?? null);

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
        await recalculateProfessionalMetrics(m, request.selectedProfessionalId);
        // Ya reseñó: "Podés dejar una reseña" deja de pedir algo y el profesional se entera.
        await markNotificationsRead(m, {
          userId: clientId,
          requestId,
          types: [NotificationType.CLIENT_REVIEW_AVAILABLE],
        });
        // "Pedile la reseña" al profesional ya no pide nada.
        await markNotificationsRead(m, {
          userId: professional!.userId,
          requestId,
          types: [NotificationType.PRO_JOB_COMPLETED],
        });
        await notify(
          m,
          {
            userId: professional!.userId,
            type: NotificationType.PRO_REVIEW_RECEIVED,
            requestId,
            dedupeRef: saved.id,
          },
          clientId,
        );
        await recordFunnelEvent(m, {
          type: FunnelEventType.REVIEW_SUBMITTED,
          professionalId: request.selectedProfessionalId,
          ref: requestId,
        });
        return saved;
      });
      return presentOwnReview(review);
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
