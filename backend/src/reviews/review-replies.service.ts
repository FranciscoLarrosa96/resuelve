import { Injectable } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { Review } from './review.entity';
import { presentPublicReview } from './review.presenter';
import { normalizeReviewReply, reviewReplyProblem } from './review-reply';

export const OWN_REVIEWS_PAGE_SIZE = 20;

/** Reseñas propias del profesional (por Resuelve e invitadas) y su respuesta pública. */
@Injectable()
export class ReviewRepliesService {
  constructor(private readonly dataSource: DataSource) {}

  /** Más recientes primero; las ocultadas por moderación no se muestran (ni se responden). */
  async listOwn(pro: ProfessionalProfile, page = 1) {
    const repo = this.dataSource.getRepository(Review);
    const where = { professionalId: pro.id, hiddenAt: IsNull() };
    const [items, total] = await repo.findAndCount({
      where,
      relations: { client: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * OWN_REVIEWS_PAGE_SIZE,
      take: OWN_REVIEWS_PAGE_SIZE,
    });
    return { items: items.map(presentPublicReview), page, pageSize: OWN_REVIEWS_PAGE_SIZE, total };
  }

  async reply(pro: ProfessionalProfile, reviewId: string, text: string) {
    const reply = normalizeReviewReply(text);
    const problem = reviewReplyProblem(reply);
    if (problem) throw AppException.unprocessable(ErrorCode.INVALID_REVIEW_REPLY, problem);
    const review = await this.findOwn(pro, reviewId);
    review.professionalReply = reply;
    review.professionalRepliedAt = new Date();
    await this.dataSource.getRepository(Review).save(review);
    return presentPublicReview(review);
  }

  async removeReply(pro: ProfessionalProfile, reviewId: string) {
    const review = await this.findOwn(pro, reviewId);
    review.professionalReply = null;
    review.professionalRepliedAt = null;
    await this.dataSource.getRepository(Review).save(review);
    return presentPublicReview(review);
  }

  /** Solo reseñas propias y visibles: la de otro perfil (u oculta) responde 404. */
  private async findOwn(pro: ProfessionalProfile, reviewId: string): Promise<Review> {
    const review = await this.dataSource.getRepository(Review).findOne({
      where: { id: reviewId, professionalId: pro.id, hiddenAt: IsNull() },
      relations: { client: true },
    });
    if (!review) throw AppException.notFound('Reseña');
    return review;
  }
}
