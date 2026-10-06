import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { isPublicProfile } from '../professionals/professional-rules';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { NotificationType } from '../notifications/notification.entity';
import { notify } from '../notifications/notify';
import { ServiceRequest } from '../requests/service-request.entity';
import { CreateReviewDto } from './dto/review.dto';
import {
  INVITED_REVIEW_MESSAGES,
  INVITED_REVIEWS_WINDOW_DAYS,
  invitedReviewBlocker,
  type InvitedReviewBlocker,
} from './invited-review';
import { REVIEWABLE_STATUSES } from './review-eligibility';
import { Review } from './review.entity';
import { presentOwnReview } from './review.presenter';

@Injectable()
export class InvitedReviewsService {
  constructor(private readonly dataSource: DataSource) {}

  /** Para la pantalla de reseña: si puede reseñar o por qué no (así no completa un formulario inútil). */
  async status(clientId: string, professionalId: string) {
    const profile = await this.publicProfile(this.dataSource.manager, professionalId);
    const { blocker, pendingJobRequestId, own } = await this.evaluate(
      this.dataSource.manager,
      clientId,
      profile,
    );
    return {
      canReview: blocker === null,
      blocker,
      /** Con `USE_JOB_REVIEW`: la solicitud donde sí tiene que reseñar. */
      requestId: blocker === 'USE_JOB_REVIEW' ? pendingJobRequestId : null,
      review: own ? presentOwnReview(own) : null,
    };
  }

  /**
   * Guarda la reseña por invitación. Todo en una transacción con el perfil bloqueado:
   * dos envíos a la vez no pasan el tope ni duplican. No toca rating, cantidad ni ranking.
   */
  async create(clientId: string, professionalId: string, dto: CreateReviewDto) {
    try {
      const saved = await this.dataSource.transaction(async (m) => {
        await m.findOne(ProfessionalProfile, {
          where: { id: professionalId },
          lock: { mode: 'pessimistic_write' },
        });
        const profile = await this.publicProfile(m, professionalId);
        const { blocker } = await this.evaluate(m, clientId, profile);
        if (blocker) throw this.blocked(blocker);

        const review = await m.save(
          m.create(Review, {
            requestId: null,
            professionalId,
            clientId,
            rating: dto.rating,
            comment: dto.comment || null,
            verifiedWork: false,
          }),
        );
        await notify(
          m,
          { userId: profile.userId, type: NotificationType.PRO_REVIEW_RECEIVED, dedupeRef: review.id },
          clientId,
        );
        return review;
      });
      return presentOwnReview(saved);
    } catch (e) {
      if ((e as { code?: string })?.code === '23505') throw this.blocked('ALREADY_REVIEWED');
      throw e;
    }
  }

  private blocked(blocker: InvitedReviewBlocker): AppException {
    return AppException.conflict(
      blocker === 'ALREADY_REVIEWED' ? ErrorCode.REVIEW_ALREADY_EXISTS : ErrorCode.REVIEW_NOT_ALLOWED,
      INVITED_REVIEW_MESSAGES[blocker],
      { blocker },
    );
  }

  /** El perfil tiene que ser público (activo): uno pausado o inexistente es 404, como en la ficha. */
  private async publicProfile(m: EntityManager, id: string): Promise<ProfessionalProfile> {
    const profile = await m.findOneBy(ProfessionalProfile, { id });
    if (!profile || !isPublicProfile(profile)) throw AppException.notFound('Profesional');
    return profile;
  }

  private async evaluate(m: EntityManager, clientId: string, profile: ProfessionalProfile) {
    const since = new Date(Date.now() - INVITED_REVIEWS_WINDOW_DAYS * 24 * 3600 * 1000);
    const [reviews, pendingJob, recentInvitedCount] = await Promise.all([
      m.find(Review, { where: { professionalId: profile.id, clientId }, order: { createdAt: 'DESC' } }),
      m
        .createQueryBuilder(ServiceRequest, 'r')
        .select('r.id', 'id')
        .where('r.client_id = :clientId AND r.selected_professional_id = :pro', { clientId, pro: profile.id })
        .andWhere('r.accepted_quote_id IS NOT NULL')
        .andWhere('r.status::text IN (:...statuses)', { statuses: [...REVIEWABLE_STATUSES] })
        .andWhere('NOT EXISTS (SELECT 1 FROM reviews v WHERE v.request_id = r.id)')
        .orderBy('r.completed_at', 'DESC', 'NULLS LAST')
        .getRawOne<{ id: string }>(),
      m
        .createQueryBuilder(Review, 'v')
        .where('v.professional_id = :pro AND v.verified_work = false AND v.created_at >= :since', {
          pro: profile.id,
          since,
        })
        .getCount(),
    ]);
    const pendingJobRequestId = pendingJob?.id ?? null;
    const blocker = invitedReviewBlocker({
      isOwnProfile: profile.userId === clientId,
      hasReviewedBefore: reviews.length > 0,
      pendingJobRequestId,
      recentInvitedCount,
    });
    return { blocker, pendingJobRequestId, own: reviews[0] ?? null };
  }
}
