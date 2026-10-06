import { Injectable } from '@nestjs/common';
import { Brackets, DataSource, type EntityManager } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { isPublicProfile } from '../professionals/professional-rules';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { NotificationType } from '../notifications/notification.entity';
import { notify } from '../notifications/notify';
import { ServiceRequest } from '../requests/service-request.entity';
import { User } from '../users/user.entity';
import { CreateReviewDto, GuestReviewDto } from './dto/review.dto';
import {
  INVITED_REVIEW_MESSAGES,
  INVITED_REVIEWS_WINDOW_DAYS,
  invitedReviewBlocker,
  publicFirstName,
  type InvitedReviewBlocker,
} from './invited-review';
import { REVIEWABLE_STATUSES } from './review-eligibility';
import { Review } from './review.entity';
import { presentOwnReview } from './review.presenter';

/** Quién reseña: una cuenta, o un invitado identificado solo por su correo (en minúsculas). */
interface Reviewer {
  clientId: string | null;
  email: string | null;
  name: string | null;
}

@Injectable()
export class InvitedReviewsService {
  constructor(private readonly dataSource: DataSource) {}

  /** Con cuenta: si puede reseñar o por qué no (así no completa un formulario inútil). */
  async status(clientId: string, professionalId: string) {
    const profile = await this.publicProfile(this.dataSource.manager, professionalId);
    const { blocker, pendingJobRequestId, own } = await this.evaluate(this.dataSource.manager, profile, {
      clientId,
      email: null,
      name: null,
    });
    return {
      canReview: blocker === null,
      blocker,
      /** Con `USE_JOB_REVIEW`: la solicitud donde sí tiene que reseñar. */
      requestId: blocker === 'USE_JOB_REVIEW' ? pendingJobRequestId : null,
      review: own ? presentOwnReview(own) : null,
    };
  }

  /** Reseña de alguien con cuenta (ya identificado: no se le pide nombre ni correo). */
  create(clientId: string, professionalId: string, dto: CreateReviewDto) {
    return this.save(professionalId, { clientId, email: null, name: null }, dto);
  }

  /**
   * Reseña de alguien SIN cuenta: nombre de pila y correo. El correo no se verifica (no hay mails
   * transaccionales todavía): solo evita repetidas. Si coincide con una cuenta existente, valen las
   * mismas reglas que para esa cuenta (su perfil, sus reseñas, su trabajo pendiente).
   */
  createAsGuest(professionalId: string, dto: GuestReviewDto) {
    return this.save(
      professionalId,
      { clientId: null, email: dto.email.trim().toLowerCase(), name: publicFirstName(dto.name) },
      dto,
    );
  }

  /**
   * Guarda la reseña por invitación. Todo en una transacción con el perfil bloqueado: dos envíos a la
   * vez no pasan el tope ni duplican. No toca rating, cantidad ni ranking.
   */
  private async save(professionalId: string, who: Reviewer, dto: CreateReviewDto) {
    try {
      const saved = await this.dataSource.transaction(async (m) => {
        await m.findOne(ProfessionalProfile, {
          where: { id: professionalId },
          lock: { mode: 'pessimistic_write' },
        });
        const profile = await this.publicProfile(m, professionalId);
        const { blocker, pendingJobRequestId } = await this.evaluate(m, profile, who);
        if (blocker) throw this.blocked(blocker, pendingJobRequestId);

        const review = await m.save(
          m.create(Review, {
            requestId: null,
            professionalId,
            clientId: who.clientId,
            reviewerName: who.clientId ? null : who.name,
            reviewerEmail: who.clientId ? null : who.email,
            rating: dto.rating,
            comment: dto.comment || null,
            verifiedWork: false,
          }),
        );
        await notify(
          m,
          { userId: profile.userId, type: NotificationType.PRO_REVIEW_RECEIVED, dedupeRef: review.id },
          who.clientId,
        );
        return review;
      });
      return presentOwnReview(saved);
    } catch (e) {
      if ((e as { code?: string })?.code === '23505') throw this.blocked('ALREADY_REVIEWED', null);
      throw e;
    }
  }

  private blocked(blocker: InvitedReviewBlocker, requestId: string | null): AppException {
    return AppException.conflict(
      blocker === 'ALREADY_REVIEWED' ? ErrorCode.REVIEW_ALREADY_EXISTS : ErrorCode.REVIEW_NOT_ALLOWED,
      INVITED_REVIEW_MESSAGES[blocker],
      { blocker, ...(blocker === 'USE_JOB_REVIEW' && requestId ? { requestId } : {}) },
    );
  }

  /** El perfil tiene que ser público (activo): uno pausado o inexistente es 404, como en la ficha. */
  private async publicProfile(m: EntityManager, id: string): Promise<ProfessionalProfile> {
    const profile = await m.findOneBy(ProfessionalProfile, { id });
    if (!profile || !isPublicProfile(profile)) throw AppException.notFound('Profesional');
    return profile;
  }

  private async evaluate(m: EntityManager, profile: ProfessionalProfile, who: Reviewer) {
    // Un invitado cuyo correo es de una cuenta se trata como esa cuenta (no esquiva sus reglas).
    const accountId =
      who.clientId ??
      (who.email
        ? ((
            await m
              .createQueryBuilder(User, 'u')
              .select('u.id', 'id')
              .where('lower(u.email) = :email', { email: who.email })
              .getRawOne<{ id: string }>()
          )?.id ?? null)
        : null);

    const since = new Date(Date.now() - INVITED_REVIEWS_WINDOW_DAYS * 24 * 3600 * 1000);
    const [reviews, pendingJob, recentInvitedCount] = await Promise.all([
      m
        .createQueryBuilder(Review, 'v')
        .where('v.professional_id = :pro', { pro: profile.id })
        .andWhere(
          new Brackets((qb) => {
            if (accountId) qb.orWhere('v.client_id = :account', { account: accountId });
            if (who.email) qb.orWhere('lower(v.reviewer_email) = :email', { email: who.email });
          }),
        )
        .orderBy('v.created_at', 'DESC')
        .getMany(),
      accountId
        ? m
            .createQueryBuilder(ServiceRequest, 'r')
            .select('r.id', 'id')
            .where('r.client_id = :account AND r.selected_professional_id = :pro', {
              account: accountId,
              pro: profile.id,
            })
            .andWhere('r.accepted_quote_id IS NOT NULL')
            .andWhere('r.status::text IN (:...statuses)', { statuses: [...REVIEWABLE_STATUSES] })
            .andWhere('NOT EXISTS (SELECT 1 FROM reviews v WHERE v.request_id = r.id)')
            .orderBy('r.completed_at', 'DESC', 'NULLS LAST')
            .getRawOne<{ id: string }>()
        : Promise.resolve(undefined),
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
      isOwnProfile: !!accountId && profile.userId === accountId,
      hasReviewedBefore: reviews.length > 0,
      pendingJobRequestId,
      recentInvitedCount,
    });
    return { blocker, pendingJobRequestId, own: reviews[0] ?? null };
  }
}
