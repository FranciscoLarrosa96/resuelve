import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { recalculateProfessionalMetrics } from '../professionals/professional-metrics';
import { Review } from './review.entity';

export interface ReportItem {
  reportId: string;
  status: string;
  reason: string;
  details: string | null;
  reportedAt: Date;
  reporterEmail: string;
  reviewId: string;
  rating: number;
  comment: string | null;
  kind: 'VERIFICADA' | 'INVITADA';
  reviewer: string;
  professional: string;
  professionalId: string;
  hidden: boolean;
  hiddenReason: string | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
}

/**
 * Moderación de reseñas (la usa el CLI `npm run reviews:moderation`; mismo patrón que verification:review).
 * Ocultar no borra: la reseña deja de mostrarse y de contar, conserva el lugar de esa persona y se puede restaurar.
 */
@Injectable()
export class ReviewModerationService {
  constructor(private readonly dataSource: DataSource) {}

  private rows(
    where: string,
    params: unknown[],
    order = 'rr.created_at ASC',
    limit = 100,
  ): Promise<ReportItem[]> {
    return this.dataSource.query(
      `SELECT rr.id AS "reportId", rr.status, rr.reason, rr.details, rr.created_at AS "reportedAt",
              ru.email AS "reporterEmail", r.id AS "reviewId", r.rating, r.comment,
              CASE WHEN r.verified_work THEN 'VERIFICADA' ELSE 'INVITADA' END AS kind,
              COALESCE(cu.first_name, r.reviewer_name, '—') AS reviewer,
              pu.first_name || ' ' || pu.last_name AS professional, p.id AS "professionalId",
              (r.hidden_at IS NOT NULL) AS hidden, r.hidden_reason AS "hiddenReason",
              rr.resolved_at AS "resolvedAt", rr.resolved_by AS "resolvedBy"
         FROM review_reports rr
         JOIN reviews r ON r.id = rr.review_id
         JOIN users ru ON ru.id = rr.reporter_id
         JOIN professional_profiles p ON p.id = r.professional_id
         JOIN users pu ON pu.id = p.user_id
         LEFT JOIN users cu ON cu.id = r.client_id
        WHERE ${where}
        ORDER BY ${order}
        LIMIT ${Math.min(limit, 100)}`,
      params,
    );
  }

  listOpen(): Promise<ReportItem[]> {
    return this.rows(`rr.status = 'OPEN'`, []);
  }

  /** Ya resueltos (más recientes primero), con lo necesario para restaurar una reseña oculta. */
  listResolved(limit = 50): Promise<ReportItem[]> {
    return this.rows(`rr.status <> 'OPEN'`, [], 'rr.resolved_at DESC NULLS LAST', limit);
  }

  async countOpen(): Promise<number> {
    const [row] = await this.dataSource.query(
      `SELECT count(*)::int AS n FROM review_reports WHERE status = 'OPEN'`,
    );
    return row.n;
  }

  async show(reportId: string): Promise<ReportItem> {
    const [item] = await this.rows('rr.id = $1', [reportId]);
    if (!item) throw AppException.notFound('Reporte');
    return item;
  }

  /** Oculta la reseña del reporte y resuelve como HIDDEN todos sus reportes abiertos. */
  async hide(reportId: string, reviewer: string, reason: string): Promise<ReportItem> {
    const item = await this.show(reportId);
    await this.dataSource.transaction(async (m) => {
      await m.update(
        Review,
        { id: item.reviewId },
        { hiddenAt: new Date(), hiddenReason: reason.slice(0, 300) },
      );
      await m.query(
        `UPDATE review_reports SET status = 'HIDDEN', resolved_at = now(), resolved_by = $2
          WHERE review_id = $1 AND status = 'OPEN'`,
        [item.reviewId, reviewer.slice(0, 80)],
      );
      await recalculateProfessionalMetrics(m, item.professionalId);
    });
    return this.show(reportId);
  }

  /** El reporte no procede: la reseña queda como estaba. */
  async dismiss(reportId: string, reviewer: string): Promise<ReportItem> {
    const item = await this.show(reportId);
    await this.dataSource.query(
      `UPDATE review_reports SET status = 'DISMISSED', resolved_at = now(), resolved_by = $2
        WHERE id = $1 AND status = 'OPEN'`,
      [item.reportId, reviewer.slice(0, 80)],
    );
    return this.show(reportId);
  }

  /** Vuelve a mostrar una reseña oculta (y a contarla). */
  async restore(reviewId: string): Promise<void> {
    await this.dataSource.transaction(async (m) => {
      const review = await m.findOne(Review, { where: { id: reviewId } });
      if (!review) throw AppException.notFound('Reseña');
      await m.update(Review, { id: reviewId }, { hiddenAt: null, hiddenReason: null });
      await recalculateProfessionalMetrics(m, review.professionalId);
    });
  }
}
