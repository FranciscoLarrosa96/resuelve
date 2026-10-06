import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { And, DataSource, IsNull, LessThan, MoreThanOrEqual } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { fromCents, toCents } from '../common/money/money';
import {
  BUSINESS_TIME_ZONE,
  BusinessMonth,
  businessDayStart,
  businessToday,
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
import { acceptanceRate, benchmarkEligible, daysInMonth, monthWeeks } from './month-math';

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
  constructor(private readonly dataSource: DataSource, private readonly config: ConfigService) {}

  async month(profile: ProfessionalProfile, query: MonthQueryDto) {
    const period = this.resolvePeriod(query);
    const prev = previousBusinessMonth(period);
    const { start, end } = businessMonthRange(period);
    const prevStart = businessMonthRange(prev).start;
    const now = new Date();
    const comparableEnd = this.isCurrent(period)
      ? businessDayStart(new Date(Date.UTC(
          prev.year, prev.month - 1,
          Math.min(Number(businessToday(now).slice(8, 10)), daysInMonth(prev)) + 1,
        )).toISOString().slice(0, 10))
      : start;
    const plan = effectivePlan(profile);
    const entitlements = entitlementsFor(plan);

    const [counts, reviews, fresh] = await Promise.all([
      this.counts(profile.id, prevStart, comparableEnd, start, end),
      this.dataSource.getRepository(Review).find({
        where: { professionalId: profile.id, verifiedWork: true, hiddenAt: IsNull(), createdAt: And(MoreThanOrEqual(start), LessThan(end)) },
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
      const [weekly, byService, byZone, response, previousResponse, attribution, benchmark] = await Promise.all([
        this.weekly(profile.id, period, start, end),
        this.breakdown(profile.id, 'service', start, end),
        this.breakdown(profile.id, 'zone', start, end),
        this.response(profile.id, start, end, now),
        this.response(profile.id, prevStart, comparableEnd, now),
        this.attribution(profile.id, start, end),
        this.benchmark(profile.id, now),
      ]);
      const previousActivity = Object.values(counts.previous).some((n) => n > 0);
      advanced = {
        acceptedQuotesValue: counts.value.current,
        planPriceMultiple: plan === 'PRO' && this.config.get<number>('PRO_MONTHLY_PRICE_ARS', 15000) > 0 &&
          toCents(counts.value.current) > 0
          ? Math.round(toCents(counts.value.current) / (this.config.get<number>('PRO_MONTHLY_PRICE_ARS', 15000) * 100) * 10) / 10
          : null,
        /** De los presupuestos enviados este mes, cuántos ya aceptaron (misma base, nunca > 100 %). */
        acceptance: {
          sent: current.quotesSent,
          accepted: counts.sentAccepted,
          rate: acceptanceRate(counts.sentAccepted, current.quotesSent),
        },
        response: { ...response, previous: previousResponse },
        attribution,
        benchmark,
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
      const e = await this.exposure(profile.id, prevStart, comparableEnd, start, end);
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
        comparisonThroughDay: this.isCurrent(period)
          ? Math.min(Number(businessToday(now).slice(8, 10)), daysInMonth(prev))
          : null,
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

  /** Invitaciones disponibles en el período; un quote cuenta una vez por request. */
  private async response(professionalId: string, start: Date, end: Date, now: Date) {
    const [row] = await this.dataSource.query<{
      opportunities: number; answered: number; median_minutes: string | null;
    }[]>(
      `WITH first_quote AS (
         SELECT request_id, min(created_at) AS first_at FROM quotes
          WHERE professional_id = $1 AND created_at >= $2 AND created_at < $3 GROUP BY request_id
       ), opportunities AS (
         SELECT i.request_id, i.available_at, q.first_at
           FROM request_invitations i
           JOIN service_requests sr ON sr.id = i.request_id
           LEFT JOIN quotes selected_quote ON selected_quote.id = sr.accepted_quote_id
           LEFT JOIN first_quote q ON q.request_id = i.request_id
          WHERE i.professional_id = $1 AND i.available_at >= $2 AND i.available_at < $3
            AND i.available_at <= $4
            AND (sr.cancelled_at IS NULL OR sr.cancelled_at > i.available_at OR q.first_at IS NOT NULL)
            AND (selected_quote.accepted_at IS NULL OR selected_quote.accepted_at > i.available_at OR q.first_at IS NOT NULL)
       )
       SELECT count(*)::int AS opportunities,
              count(*) FILTER (WHERE first_at >= available_at AND first_at < $3)::int AS answered,
              percentile_cont(0.5) WITHIN GROUP
                (ORDER BY EXTRACT(EPOCH FROM (first_at - available_at)) / 60)
                FILTER (WHERE first_at IS NOT NULL AND first_at >= available_at AND first_at < $3)::text AS median_minutes
         FROM opportunities`,
      [professionalId, start, end, now],
    );
    const opportunities = Number(row.opportunities);
    const answered = Number(row.answered);
    return {
      opportunities,
      answered,
      rate: acceptanceRate(answered, opportunities),
      medianMinutes: row.median_minutes === null ? null : Math.round(Number(row.median_minutes)),
    };
  }

  /** Solo eventos PRO explícitos; trial y targeted no se adjudican a PRO. */
  private async attribution(professionalId: string, start: Date, end: Date) {
    const [row] = await this.dataSource.query<{ early: number; featured: number; featured_accepted: number }[]>(
      `SELECT
         (SELECT count(DISTINCT ref) FROM pro_funnel_events
           WHERE professional_id = $1 AND type = 'EARLY_OPPORTUNITY_DELIVERED'
             AND context->>'billingPlan' = 'PRO' AND context->>'earlyAccess' = 'true'
             AND occurred_at >= $2 AND occurred_at < $3)::int AS early,
         (SELECT count(*) FROM request_invitations
           WHERE professional_id = $1 AND attribution_source = 'PRO_FEATURED'
             AND sent_at >= $2 AND sent_at < $3)::int AS featured,
         (SELECT count(DISTINCT i.request_id) FROM request_invitations i
           JOIN quotes q ON q.request_id = i.request_id AND q.professional_id = i.professional_id
           WHERE i.professional_id = $1 AND i.attribution_source = 'PRO_FEATURED'
             AND q.accepted_at >= $2 AND q.accepted_at < $3)::int AS featured_accepted`,
      [professionalId, start, end],
    );
    return {
      earlyAccessOpportunities: Number(row.early),
      featuredAttributedRequests: Number(row.featured),
      featuredAttributedAccepted: Number(row.featured_accepted),
    };
  }

  /** Referencia de 90 días para el servicio con más invitaciones propias. Solo sale agregado. */
  private async benchmark(professionalId: string, now: Date) {
    const since = new Date(now.getTime() - 90 * 86_400_000);
    const [service] = await this.dataSource.query<{ id: string; name: string }[]>(
      `SELECT s.id, s.name FROM request_invitations i
         JOIN service_requests sr ON sr.id = i.request_id JOIN services s ON s.id = sr.service_id
        WHERE i.professional_id = $1 AND i.available_at >= $2 AND i.available_at <= $3
        GROUP BY s.id, s.name ORDER BY count(*) DESC, s.name ASC LIMIT 1`,
      [professionalId, since, now],
    );
    if (!service) return { available: false as const, periodDays: 90 };
    const [row] = await this.dataSource.query<{
      cohort: number; responders: number; events: number; median_minutes: string | null;
      response_rate: string | null; acceptance_rate: string | null;
    }[]>(
      `WITH first_quote AS (
         SELECT professional_id, request_id, min(created_at) AS first_at,
                bool_or(accepted_at IS NOT NULL) AS accepted
           FROM quotes WHERE created_at >= $3 AND created_at <= $4
           GROUP BY professional_id, request_id
       ), cohort_events AS (
         SELECT i.professional_id, i.request_id, i.available_at, q.first_at, q.accepted
           FROM request_invitations i
           JOIN service_requests sr ON sr.id = i.request_id
           LEFT JOIN quotes selected_quote ON selected_quote.id = sr.accepted_quote_id
           JOIN zones z ON z.id = sr.zone_id JOIN cities c ON c.id = z.city_id
           JOIN professional_profiles pp ON pp.id = i.professional_id
           LEFT JOIN first_quote q ON q.professional_id = i.professional_id AND q.request_id = i.request_id
          WHERE sr.service_id = $1 AND c.slug = 'tandil' AND pp.status::text = 'ACTIVE'
            AND i.professional_id <> $2 AND i.available_at >= $3 AND i.available_at <= $4
            AND (sr.cancelled_at IS NULL OR sr.cancelled_at > i.available_at OR q.first_at IS NOT NULL)
            AND (selected_quote.accepted_at IS NULL OR selected_quote.accepted_at > i.available_at OR q.first_at IS NOT NULL)
       ), per_pro AS (
         SELECT professional_id, count(*) AS opportunities,
                count(*) FILTER (WHERE first_at >= available_at) AS answered,
                count(*) FILTER (WHERE accepted) AS accepted,
                percentile_cont(0.5) WITHIN GROUP
                  (ORDER BY EXTRACT(EPOCH FROM (first_at - available_at)) / 60)
                  FILTER (WHERE first_at >= available_at) AS median_minutes
           FROM cohort_events GROUP BY professional_id
       )
       SELECT count(*)::int AS cohort, count(*) FILTER (WHERE answered > 0)::int AS responders,
              COALESCE(sum(opportunities), 0)::int AS events,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY median_minutes)
                FILTER (WHERE median_minutes IS NOT NULL)::text AS median_minutes,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY answered * 100.0 / opportunities)::text AS response_rate,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY accepted * 100.0 / NULLIF(answered, 0))
                FILTER (WHERE answered > 0)::text AS acceptance_rate
         FROM per_pro`,
      [service.id, professionalId, since, now],
    );
    const minProfessionals = this.config.get<number>('PRO_BENCHMARK_MIN_PROFESSIONALS', 8);
    const minEvents = this.config.get<number>('PRO_BENCHMARK_MIN_EVENTS', 20);
    if (!benchmarkEligible(Number(row.cohort), Number(row.responders), Number(row.events), minProfessionals, minEvents)) {
      return { available: false as const, periodDays: 90 };
    }
    return {
      available: true as const, periodDays: 90, serviceName: service.name,
      cohortSize: Number(row.cohort),
      medianResponseMinutes: row.median_minutes === null ? null : Math.round(Number(row.median_minutes)),
      responseRate: row.response_rate === null ? null : Math.round(Number(row.response_rate) * 10) / 10,
      acceptanceRate: row.acceptance_rate === null ? null : Math.round(Number(row.acceptance_rate) * 10) / 10,
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
  private async counts(professionalId: string, prevStart: Date, prevEnd: Date, start: Date, end: Date) {
    const [row] = await this.dataSource.query<Record<string, string | number>[]>(
      `WITH inv AS (
         SELECT sent_at >= $4 AS cur FROM request_invitations
          WHERE professional_id = $1 AND ((sent_at >= $2 AND sent_at < $3) OR (sent_at >= $4 AND sent_at < $5))),
       sent AS (
         SELECT first_at >= $4 AS cur, accepted FROM (
           SELECT min(created_at) AS first_at, bool_or(accepted_at IS NOT NULL) AS accepted FROM quotes
            WHERE professional_id = $1 AND created_at < $5
            GROUP BY request_id) f
          WHERE (first_at >= $2 AND first_at < $3) OR (first_at >= $4 AND first_at < $5)),
       acc AS (
         SELECT accepted_at >= $4 AS cur, total_amount FROM quotes
          WHERE professional_id = $1 AND ((accepted_at >= $2 AND accepted_at < $3) OR (accepted_at >= $4 AND accepted_at < $5))),
       appt AS (
         SELECT ((scheduled_date + COALESCE(scheduled_time, '00:00'::time)) AT TIME ZONE 'America/Argentina/Buenos_Aires') >= $4 AS cur
           FROM jobs
          WHERE professional_id = $1 AND status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED')
            AND (((scheduled_date + COALESCE(scheduled_time, '00:00'::time)) AT TIME ZONE 'America/Argentina/Buenos_Aires') >= $2
             AND ((scheduled_date + COALESCE(scheduled_time, '00:00'::time)) AT TIME ZONE 'America/Argentina/Buenos_Aires') < $3
              OR ((scheduled_date + COALESCE(scheduled_time, '00:00'::time)) AT TIME ZONE 'America/Argentina/Buenos_Aires') >= $4
             AND ((scheduled_date + COALESCE(scheduled_time, '00:00'::time)) AT TIME ZONE 'America/Argentina/Buenos_Aires') < $5)
         UNION ALL
         SELECT scheduled_start >= $4 AS cur FROM appointments a
          WHERE professional_id = $1 AND status IN ('CONFIRMED', 'COMPLETED')
            AND ((scheduled_start >= $2 AND scheduled_start < $3) OR (scheduled_start >= $4 AND scheduled_start < $5))
            AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.request_id = a.request_id)),
       done AS (
         SELECT completed_at >= $4 AS cur FROM jobs
          WHERE professional_id = $1 AND status = 'COMPLETED' AND completed_at IS NOT NULL
            AND ((completed_at >= $2 AND completed_at < $3) OR (completed_at >= $4 AND completed_at < $5))
         UNION ALL
         SELECT completed_at >= $4 AS cur FROM service_requests r
          WHERE selected_professional_id = $1 AND status::text = ANY($6)
            AND ((completed_at >= $2 AND completed_at < $3) OR (completed_at >= $4 AND completed_at < $5))
            AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.request_id = r.id)),
       rev AS (
         SELECT created_at >= $4 AS cur FROM reviews
          WHERE professional_id = $1 AND verified_work AND hidden_at IS NULL AND ((created_at >= $2 AND created_at < $3) OR (created_at >= $4 AND created_at < $5)))
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
      [professionalId, prevStart, prevEnd, start, end, [...WORK_DONE_STATUSES]],
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
  private async exposure(professionalId: string, prevStart: Date, prevEnd: Date, start: Date, end: Date) {
    const [row] = await this.dataSource.query<Record<string, number>[]>(
      `SELECT
         count(*) FILTER (WHERE type = 'SEARCH_IMPRESSION' AND occurred_at >= $4)::int AS imp_cur,
         count(*) FILTER (WHERE type = 'SEARCH_IMPRESSION' AND occurred_at >= $4 AND is_featured_placement)::int AS feat_cur,
         count(*) FILTER (WHERE type = 'PROFILE_VIEW' AND occurred_at >= $4)::int AS views_cur,
         count(*) FILTER (WHERE type = 'SEARCH_IMPRESSION' AND occurred_at < $3)::int AS imp_prev,
         count(*) FILTER (WHERE type = 'PROFILE_VIEW' AND occurred_at < $3)::int AS views_prev
         FROM exposure_events
        WHERE professional_id = $1 AND ((occurred_at >= $2 AND occurred_at < $3) OR (occurred_at >= $4 AND occurred_at < $5))`,
      [professionalId, prevStart, prevEnd, start, end],
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
         FROM jobs
        WHERE professional_id = $1 AND status = 'COMPLETED'
          AND completed_at >= $2 AND completed_at < $3 GROUP BY 2
       UNION ALL
       SELECT 'completedJobs', ${week('completed_at')}, count(*)::int
         FROM service_requests r
        WHERE selected_professional_id = $1 AND status::text = ANY($4)
          AND completed_at >= $2 AND completed_at < $3
          AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.request_id = r.id) GROUP BY 2`,
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
