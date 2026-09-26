import { Injectable } from '@nestjs/common';
import { And, DataSource, LessThan, MoreThanOrEqual } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { fromCents, toCents } from '../common/money/money';
import {
  BUSINESS_TIME_ZONE,
  BusinessMonth,
  businessMonthRange,
  currentBusinessMonth,
  previousBusinessMonth,
} from '../common/time';
import { entitlementsFor, effectivePlan } from '../plans/plan';
import { publicRating } from '../professionals/professional.presenter';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { WORK_DONE_STATUSES } from '../requests/request-state-machine';
import { Review } from '../reviews/review.entity';
import { presentPublicReview } from '../reviews/review.presenter';
import { MonthQueryDto } from './analytics.dto';
import { ratio } from './exposure';
import { acceptanceRate, monthWeeks } from './month-math';

/** Qué cuenta cada métrica (todas SOLO del profesional autenticado). */
interface MonthCounts {
  /** Invitaciones recibidas (`request_invitations.sent_at` en el mes). */
  requestsReceived: number;
  /** Solicitudes distintas presupuestadas por PRIMERA vez en el mes (misma base que el cupo FREE). */
  quotesSent: number;
  /** Presupuestos aceptados por el cliente (`quotes.accepted_at` en el mes). */
  quotesAccepted: number;
  /** Citas confirmadas (o ya realizadas) cuyo horario empieza en el mes. */
  scheduledJobs: number;
  /** Trabajos elegido + realizado con `completed_at` en el mes. */
  completedJobs: number;
  /** Reseñas creadas en el mes. */
  reviewsReceived: number;
}

type Dimension = 'service' | 'zone';

const RECENT_REVIEWS = 3;

/**
 * "Tu mes": agrega en SQL (sin traer entidades ni N+1) la actividad real de
 * un profesional en un mes calendario de Argentina. Cada query filtra por el
 * id del profesional: nunca expone actividad de otros.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly dataSource: DataSource) {}

  async month(profile: ProfessionalProfile, query: MonthQueryDto) {
    const period = this.resolvePeriod(query);
    const prev = previousBusinessMonth(period);
    const { start, end } = businessMonthRange(period);
    const prevStart = businessMonthRange(prev).start;
    const plan = effectivePlan(profile);
    const entitlements = entitlementsFor(plan);

    const [counts, reviews, fresh] = await Promise.all([
      this.counts(profile.id, prevStart, start, end),
      this.dataSource.getRepository(Review).find({
        where: { professionalId: profile.id, createdAt: And(MoreThanOrEqual(start), LessThan(end)) },
        relations: { client: true },
        order: { createdAt: 'DESC', id: 'ASC' },
        take: RECENT_REVIEWS,
      }),
      this.dataSource.getRepository(ProfessionalProfile).findOneByOrFail({ id: profile.id }),
    ]);
    const current = counts.current;

    const basic = {
      ...current,
      /** Rating ACTUAL (histórico), no solo del mes. null = sin reseñas. */
      currentRating: publicRating(fresh),
      reviewCount: fresh.reviewsCount,
    };

    let advanced = null;
    if (entitlements.canUseAdvancedAnalytics) {
      const [weekly, byService, byZone] = await Promise.all([
        this.weekly(profile.id, period, start, end),
        this.breakdown(profile.id, 'service', start, end),
        this.breakdown(profile.id, 'zone', start, end),
      ]);
      const previousActivity = Object.values(counts.previous).some((n) => n > 0);
      advanced = {
        acceptedQuotesValue: counts.value.current,
        /** De los presupuestos enviados este mes, cuántos ya aceptaron (misma base, nunca > 100 %). */
        acceptance: {
          sent: current.quotesSent,
          accepted: counts.sentAccepted,
          rate: acceptanceRate(counts.sentAccepted, current.quotesSent),
        },
        /** null = el mes anterior no tuvo actividad: no hay base para comparar. */
        previous: previousActivity
          ? { ...prev, ...counts.previous, acceptedQuotesValue: counts.value.previous }
          : null,
        weekly,
        byService,
        byZone,
      };
    }

    let exposure = null;
    if (entitlements.canSeeExposureAnalytics) {
      const e = await this.exposure(profile.id, prevStart, start, end);
      exposure = {
        impressions: e.current.impressions,
        /** De esas apariciones, cuántas fueron en un espacio "Destacado". */
        featuredImpressions: e.current.featuredImpressions,
        profileViews: e.current.profileViews,
        /** Tasas solo con denominador > 0 (null = "—"). */
        rates: {
          viewsPerImpression: ratio(e.current.profileViews, e.current.impressions),
          requestsPerView: ratio(current.requestsReceived, e.current.profileViews),
          acceptance: acceptanceRate(counts.sentAccepted, current.quotesSent),
        },
        /** null = el mes anterior no tuvo apariciones ni visitas registradas. */
        previous:
          e.previous.impressions + e.previous.profileViews > 0
            ? { impressions: e.previous.impressions, profileViews: e.previous.profileViews }
            : null,
      };
    }

    return {
      period: {
        ...period,
        start,
        end,
        isCurrent: this.isCurrent(period),
        /** Primer mes con perfil: no se navega más atrás. */
        earliest: currentBusinessMonth(fresh.createdAt),
      },
      plan,
      entitlements,
      basic,
      /** Hasta 3 reseñas reales del mes, más recientes primero. */
      recentReviews: reviews.map(presentPublicReview),
      advanced,
      exposure,
    };
  }

  private isCurrent(p: BusinessMonth): boolean {
    const now = currentBusinessMonth();
    return now.year === p.year && now.month === p.month;
  }

  private resolvePeriod(q: MonthQueryDto): BusinessMonth {
    const now = currentBusinessMonth();
    if (q.year === undefined && q.month === undefined) return now;
    if (q.year === undefined || q.month === undefined) {
      throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, 'Indicá año y mes juntos', {
        fields: ['year', 'month'],
      });
    }
    const asked = { year: q.year, month: q.month };
    const key = (m: BusinessMonth) => m.year * 12 + m.month;
    if (key(asked) > key(now)) {
      throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, 'Ese mes todavía no empezó', {
        fields: ['year', 'month'],
      });
    }
    // Antes de tener perfil no hay actividad: se responde igual (todo en cero), sin error.
    return asked;
  }

  /** Mes actual y anterior en una sola query (cada CTE usa un índice por profesional + fecha). */
  private async counts(professionalId: string, prevStart: Date, start: Date, end: Date) {
    const [row] = await this.dataSource.query<Record<string, string | number>[]>(
      `WITH inv AS (
         SELECT sent_at >= $3 AS cur FROM request_invitations
          WHERE professional_id = $1 AND sent_at >= $2 AND sent_at < $4),
       sent AS (
         SELECT first_at >= $3 AS cur, accepted FROM (
           SELECT min(created_at) AS first_at, bool_or(accepted_at IS NOT NULL) AS accepted FROM quotes
            WHERE professional_id = $1 AND created_at < $4
            GROUP BY request_id) f
          WHERE first_at >= $2),
       acc AS (
         SELECT accepted_at >= $3 AS cur, total_amount FROM quotes
          WHERE professional_id = $1 AND accepted_at >= $2 AND accepted_at < $4),
       appt AS (
         SELECT scheduled_start >= $3 AS cur FROM appointments
          WHERE professional_id = $1 AND status IN ('CONFIRMED', 'COMPLETED')
            AND scheduled_start >= $2 AND scheduled_start < $4),
       done AS (
         SELECT completed_at >= $3 AS cur FROM service_requests
          WHERE selected_professional_id = $1 AND status::text = ANY($5)
            AND completed_at >= $2 AND completed_at < $4),
       rev AS (
         SELECT created_at >= $3 AS cur FROM reviews
          WHERE professional_id = $1 AND created_at >= $2 AND created_at < $4)
       SELECT
         (SELECT count(*) FILTER (WHERE cur) FROM inv)::int AS requests_cur,
         (SELECT count(*) FILTER (WHERE NOT cur) FROM inv)::int AS requests_prev,
         (SELECT count(*) FILTER (WHERE cur) FROM sent)::int AS sent_cur,
         (SELECT count(*) FILTER (WHERE NOT cur) FROM sent)::int AS sent_prev,
         (SELECT count(*) FILTER (WHERE cur AND accepted) FROM sent)::int AS sent_accepted_cur,
         (SELECT count(*) FILTER (WHERE cur) FROM acc)::int AS accepted_cur,
         (SELECT count(*) FILTER (WHERE NOT cur) FROM acc)::int AS accepted_prev,
         (SELECT COALESCE(sum(total_amount) FILTER (WHERE cur), 0) FROM acc)::text AS value_cur,
         (SELECT COALESCE(sum(total_amount) FILTER (WHERE NOT cur), 0) FROM acc)::text AS value_prev,
         (SELECT count(*) FILTER (WHERE cur) FROM appt)::int AS scheduled_cur,
         (SELECT count(*) FILTER (WHERE NOT cur) FROM appt)::int AS scheduled_prev,
         (SELECT count(*) FILTER (WHERE cur) FROM done)::int AS done_cur,
         (SELECT count(*) FILTER (WHERE NOT cur) FROM done)::int AS done_prev,
         (SELECT count(*) FILTER (WHERE cur) FROM rev)::int AS reviews_cur,
         (SELECT count(*) FILTER (WHERE NOT cur) FROM rev)::int AS reviews_prev`,
      [professionalId, prevStart, start, end, [...WORK_DONE_STATUSES]],
    );
    const n = (key: string) => Number(row[key]);
    const pick = (suffix: 'cur' | 'prev'): MonthCounts => ({
      requestsReceived: n(`requests_${suffix}`),
      quotesSent: n(`sent_${suffix}`),
      quotesAccepted: n(`accepted_${suffix}`),
      scheduledJobs: n(`scheduled_${suffix}`),
      completedJobs: n(`done_${suffix}`),
      reviewsReceived: n(`reviews_${suffix}`),
    });
    const money = (v: string | number) => fromCents(toCents(String(v)));
    return {
      current: pick('cur'),
      previous: pick('prev'),
      sentAccepted: n('sent_accepted_cur'),
      value: { current: money(row.value_cur), previous: money(row.value_prev) },
    };
  }

  /** Apariciones y visitas al perfil del mes y del anterior (índice profesional + tipo + fecha). */
  private async exposure(professionalId: string, prevStart: Date, start: Date, end: Date) {
    const [row] = await this.dataSource.query<Record<string, number>[]>(
      `SELECT
         count(*) FILTER (WHERE type = 'SEARCH_IMPRESSION' AND occurred_at >= $3)::int AS imp_cur,
         count(*) FILTER (WHERE type = 'SEARCH_IMPRESSION' AND occurred_at >= $3 AND is_featured_placement)::int AS feat_cur,
         count(*) FILTER (WHERE type = 'PROFILE_VIEW' AND occurred_at >= $3)::int AS views_cur,
         count(*) FILTER (WHERE type = 'SEARCH_IMPRESSION' AND occurred_at < $3)::int AS imp_prev,
         count(*) FILTER (WHERE type = 'PROFILE_VIEW' AND occurred_at < $3)::int AS views_prev
         FROM exposure_events
        WHERE professional_id = $1 AND occurred_at >= $2 AND occurred_at < $4`,
      [professionalId, prevStart, start, end],
    );
    return {
      current: { impressions: row.imp_cur, featuredImpressions: row.feat_cur, profileViews: row.views_cur },
      previous: { impressions: row.imp_prev, profileViews: row.views_prev },
    };
  }

  /** Solicitudes, presupuestos y trabajos realizados por semana del mes (1–7, 8–14, …). */
  private async weekly(professionalId: string, period: BusinessMonth, start: Date, end: Date) {
    const week = (col: string) =>
      `LEAST(4, (EXTRACT(DAY FROM (${col} AT TIME ZONE '${BUSINESS_TIME_ZONE}'))::int - 1) / 7)`;
    const rows = await this.dataSource.query<{ metric: string; week: number; count: number }[]>(
      `SELECT 'requestsReceived' AS metric, ${week('sent_at')} AS week, count(*)::int AS count
         FROM request_invitations
        WHERE professional_id = $1 AND sent_at >= $2 AND sent_at < $3 GROUP BY 2
       UNION ALL
       SELECT 'quotesSent', ${week('created_at')}, count(*)::int
         FROM (SELECT min(created_at) AS created_at FROM quotes
                WHERE professional_id = $1 AND created_at < $3
                GROUP BY request_id) q
        WHERE created_at >= $2 GROUP BY 2
       UNION ALL
       SELECT 'completedJobs', ${week('completed_at')}, count(*)::int
         FROM service_requests
        WHERE selected_professional_id = $1 AND status::text = ANY($4)
          AND completed_at >= $2 AND completed_at < $3 GROUP BY 2`,
      [professionalId, start, end, [...WORK_DONE_STATUSES]],
    );
    return monthWeeks(period).map((w, i) => {
      const count = (metric: string) =>
        rows.find((r) => r.metric === metric && Number(r.week) === i)?.count ?? 0;
      return {
        ...w,
        requestsReceived: count('requestsReceived'),
        quotesSent: count('quotesSent'),
        completedJobs: count('completedJobs'),
      };
    });
  }

  /** Rendimiento por servicio o por barrio de la solicitud. Solo filas con actividad. */
  private async breakdown(professionalId: string, by: Dimension, start: Date, end: Date) {
    const col = by === 'service' ? 'sr.service_id' : 'sr.zone_id';
    const table = by === 'service' ? 'services' : 'zones';
    const rows = await this.dataSource.query<
      { id: string; name: string; requests: number; quotes: number; accepted: number }[]
    >(
      `SELECT d.id, d.name, sum(x.r)::int AS requests, sum(x.q)::int AS quotes, sum(x.a)::int AS accepted
         FROM (
           SELECT ${col} AS key, 1 AS r, 0 AS q, 0 AS a
             FROM request_invitations i JOIN service_requests sr ON sr.id = i.request_id
            WHERE i.professional_id = $1 AND i.sent_at >= $2 AND i.sent_at < $3
           UNION ALL
           SELECT ${col}, 0, 1, 0
             FROM (SELECT request_id FROM quotes
                    WHERE professional_id = $1 AND created_at < $3
                    GROUP BY request_id HAVING min(created_at) >= $2) q
             JOIN service_requests sr ON sr.id = q.request_id
           UNION ALL
           SELECT ${col}, 0, 0, 1
             FROM quotes qa JOIN service_requests sr ON sr.id = qa.request_id
            WHERE qa.professional_id = $1 AND qa.accepted_at >= $2 AND qa.accepted_at < $3
         ) x
         JOIN ${table} d ON d.id = x.key
        GROUP BY d.id, d.name
        ORDER BY requests DESC, quotes DESC, d.name ASC`,
      [professionalId, start, end],
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      requestsReceived: r.requests,
      quotesSent: r.quotes,
      quotesAccepted: r.accepted,
    }));
  }
}
