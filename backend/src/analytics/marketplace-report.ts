import type { EntityManager } from 'typeorm';

/**
 * Reporte del marketplace (solo lectura, agregado, sin datos personales): ¿los pedidos reciben
 * respuesta y cuánto tardan? Sale de registros que ya existen (`service_requests`,
 * `request_invitations`, `quotes`); no agrega instrumentación.
 *
 * Definiciones (únicas, las usa el CLI y los tests):
 * - **Pedido enviado**: pedido que salió de borrador, es decir con al menos una invitación; su
 *   hora de envío es la primera invitación (`min(request_invitations.sent_at)`). Un borrador,
 *   aunque se haya cancelado, no cuenta.
 * - **Modo**: DIRECTED si la primera tanda fue dirigida a un profesional (`targeted`), si no DISCOVERY.
 *   **Urgencia**: la del pedido (FLEXIBLE, TODAY, URGENT).
 * - **Primer presupuesto**: el `created_at` más antiguo de cualquier presupuesto del pedido.
 *   Un presupuesto que después se retiró (WITHDRAWN) o venció sigue contando: la respuesta ocurrió.
 *   Aparte se informa cuántos pedidos tienen solo presupuestos retirados.
 * - **Ventana de N horas**: el denominador es el pedido "con tiempo" (enviado hace N horas o más)
 *   y que seguía pudiendo responderse: se excluye el que se canceló antes de cumplirse la
 *   ventana sin haber recibido presupuesto. Esos dos grupos (sin tiempo todavía / cancelados antes)
 *   se informan aparte, nunca mezclados con "sin respuesta".
 * - **Mediana**: sobre los pedidos que sí recibieron presupuesto; siempre se acompaña con los
 *   que no (subestima la espera si hay muchos sin respuesta o recientes).
 * - **Aceptados / completados**: pedidos con algún presupuesto aceptado (`accepted_at`) o
 *   completados (`completed_at`), medidos hasta hoy sobre los pedidos enviados del período;
 *   los recientes todavía pueden llegar a serlo.
 * El reporte no dice por qué un pedido no tuvo respuesta: no hay datos para demostrarlo.
 */

export const REPORT_WINDOWS_HOURS = [1, 24, 72] as const;
export type ReportWindowHours = (typeof REPORT_WINDOWS_HOURS)[number];

export type ReportBreakdown = 'none' | 'city' | 'service' | 'city-service';
export const REPORT_BREAKDOWNS: readonly ReportBreakdown[] = ['none', 'city', 'service', 'city-service'];

export interface ReportOptions {
  /** Pedidos cuya primera invitación está en [from, to). */
  from: Date;
  to: Date;
  /** "Hoy" para decidir qué pedidos ya tuvieron tiempo; inyectable para poder probarlo. */
  now?: Date;
  by?: ReportBreakdown;
  cityId?: string;
  serviceId?: string;
}

export interface WindowStat {
  hours: ReportWindowHours;
  /** Pedidos con tiempo y que podían responderse (denominador del porcentaje). */
  eligible: number;
  /** Con primer presupuesto dentro de la ventana (numerador). */
  answered: number;
  /** Porcentaje con un decimal; null sin denominador. */
  percent: number | null;
  /** Enviados hace menos de N horas: todavía no tuvieron tiempo (fuera del porcentaje). */
  notYetDue: number;
  /** Cancelados antes de cumplirse la ventana y sin presupuesto (fuera del porcentaje). */
  cancelledEarly: number;
}

export interface ReportRow {
  /** null = todos. */
  mode: 'DISCOVERY' | 'DIRECTED' | null;
  urgency: 'FLEXIBLE' | 'TODAY' | 'URGENT' | null;
  sent: number;
  withQuote: number;
  withoutQuote: number;
  /** Sin presupuesto y cancelados. */
  withoutQuoteCancelled: number;
  /** Sin presupuesto, no cancelados (siguen abiertos o se cerraron sin presupuesto). */
  withoutQuoteOther: number;
  /** Sin presupuesto, no cancelados y enviados hace 72 horas o más. */
  withoutQuoteOver72h: number;
  /** Con presupuesto, pero todos retirados. */
  onlyWithdrawnQuotes: number;
  cancelled: number;
  windows: WindowStat[];
  /** Minutos hasta el primer presupuesto; null sin ninguno. Mediana sobre `withQuote`. */
  medianMinutes: number | null;
  accepted: number;
  completed: number;
}

export interface ReportGroup {
  cityId: string | null;
  cityLabel: string | null;
  serviceId: string | null;
  serviceLabel: string | null;
  /** Primero el total; después modo × urgencia, de mayor a menor cantidad. */
  rows: ReportRow[];
}

/**
 * "Sumar profesionales" (Fase 2): pedidos del período donde el cliente sumó profesionales después
 * del envío (`request_invitations.added_via`). Agregado y descriptivo: dice cuántos pedidos la
 * usaron y cuántos recibieron después su primer presupuesto, NO que la acción lo causara (no hay
 * grupo comparable: quien la usa es quien no recibió respuesta). Respecto del momento de la
 * primera vez que se sumó gente.
 */
export interface AddProfessionalsStat {
  /** Pedidos enviados del período (mismo universo que "Todos los pedidos"). */
  sentRequests: number;
  /** Pedidos que usaron "Sumar profesionales" al menos una vez. */
  used: number;
  /** Profesionales sumados en total. */
  addedProfessionals: number;
  /** Mediana de minutos entre el envío y la primera vez que se sumó gente; null sin datos. */
  medianMinutesToFirstAdd: number | null;
  /** Ya tenían presupuesto antes de sumar (fuera del resto de las cuentas). */
  quoteBeforeAdd: number;
  /** Sin presupuesto al sumar: el resto de las cuentas es sobre estos. */
  withoutQuoteAtAdd: number;
  /** De esos, con algún presupuesto después (hasta hoy). */
  quoteAfterAdd: number;
  /** De esos, el primero vino de un profesional sumado (hecho, no causa). */
  firstQuoteFromAdded: number;
  /** Primer presupuesto dentro de N horas desde que se sumó gente (mismas reglas de denominador que el resto). */
  windows: WindowStat[];
  /** Aún sin presupuesto y cancelados (sobre `withoutQuoteAtAdd`). */
  stillWithoutQuote: number;
  cancelledWithoutQuote: number;
}

export interface MarketplaceReport {
  from: string;
  to: string;
  now: string;
  by: ReportBreakdown;
  groups: ReportGroup[];
  addProfessionals: AddProfessionalsStat;
}

/** % con un decimal; null sin denominador. */
export const percentOf = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

type Raw = Record<string, string | number | boolean | null>;
const n = (v: unknown): number => Number(v ?? 0);

const windowSql = (h: ReportWindowHours) => {
  const due = `r.sent_at + make_interval(hours => ${h})`;
  const answeredInTime = `coalesce(r.first_quote_at <= ${due}, false)`;
  const eligible = `(${due} <= $3 AND (r.cancelled_at IS NULL OR r.cancelled_at >= ${due} OR ${answeredInTime}))`;
  return `
      count(*) FILTER (WHERE ${eligible})::int AS "eligible_${h}",
      count(*) FILTER (WHERE ${due} <= $3 AND ${answeredInTime})::int AS "answered_${h}",
      count(*) FILTER (WHERE ${due} > $3)::int AS "not_yet_${h}",
      count(*) FILTER (WHERE ${due} <= $3 AND NOT ${eligible})::int AS "cancelled_early_${h}"`;
};

export async function marketplaceReport(
  m: Pick<EntityManager, 'query'>,
  opts: ReportOptions,
): Promise<MarketplaceReport> {
  const now = opts.now ?? new Date();
  const by = opts.by ?? 'none';
  const withCity = by === 'city' || by === 'city-service';
  const withService = by === 'service' || by === 'city-service';
  const dims = [withCity ? 'r.city_id' : null, withService ? 'r.service_id' : null].filter(Boolean) as string[];
  const params: unknown[] = [opts.from, opts.to, now];
  const filters: string[] = [];
  if (opts.cityId) filters.push(`AND sr.city_id = $${params.push(opts.cityId)}`);
  if (opts.serviceId) filters.push(`AND sr.service_id = $${params.push(opts.serviceId)}`);

  const rows = await m.query<Raw[]>(
    `WITH sent AS (
       SELECT sr.id, sr.city_id, sr.service_id, sr.urgency::text AS urgency,
              CASE WHEN bool_or(i.targeted) THEN 'DIRECTED' ELSE 'DISCOVERY' END AS mode,
              min(i.sent_at) AS sent_at, sr.cancelled_at, sr.completed_at
         FROM service_requests sr
         JOIN request_invitations i ON i.request_id = sr.id
        WHERE sr.status::text <> 'DRAFT' ${filters.join(' ')}
        GROUP BY sr.id
       HAVING min(i.sent_at) >= $1 AND min(i.sent_at) < $2
     ), q AS (
       SELECT s.id, min(q.created_at) AS first_quote_at,
              bool_or(q.accepted_at IS NOT NULL) AS accepted,
              bool_and(q.status::text = 'WITHDRAWN') AS only_withdrawn
         FROM sent s JOIN quotes q ON q.request_id = s.id
        GROUP BY s.id
     ), r AS (
       SELECT s.*, q.first_quote_at, coalesce(q.accepted, false) AS accepted,
              coalesce(q.only_withdrawn, false) AS only_withdrawn,
              EXTRACT(EPOCH FROM (q.first_quote_at - s.sent_at)) / 60 AS minutes
         FROM sent s LEFT JOIN q ON q.id = s.id
     )
     SELECT ${dims.map((d) => `${d} AS "${d.slice(2)}"`).join(', ')}${dims.length ? ',' : ''}
            CASE WHEN GROUPING(r.mode) = 1 THEN NULL ELSE r.mode END AS mode,
            CASE WHEN GROUPING(r.urgency) = 1 THEN NULL ELSE r.urgency END AS urgency,
            count(*)::int AS sent,
            count(*) FILTER (WHERE r.first_quote_at IS NOT NULL)::int AS with_quote,
            count(*) FILTER (WHERE r.first_quote_at IS NULL)::int AS without_quote,
            count(*) FILTER (WHERE r.first_quote_at IS NULL AND r.cancelled_at IS NOT NULL)::int AS without_quote_cancelled,
            count(*) FILTER (WHERE r.first_quote_at IS NULL AND r.cancelled_at IS NULL)::int AS without_quote_other,
            count(*) FILTER (WHERE r.first_quote_at IS NULL AND r.cancelled_at IS NULL
                               AND r.sent_at + make_interval(hours => 72) <= $3)::int AS without_quote_72h,
            count(*) FILTER (WHERE r.first_quote_at IS NOT NULL AND r.only_withdrawn)::int AS only_withdrawn,
            count(*) FILTER (WHERE r.cancelled_at IS NOT NULL)::int AS cancelled,
            count(*) FILTER (WHERE r.accepted)::int AS accepted,
            count(*) FILTER (WHERE r.completed_at IS NOT NULL)::int AS completed,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY r.minutes)
              FILTER (WHERE r.first_quote_at IS NOT NULL)::text AS median_minutes,
            ${REPORT_WINDOWS_HOURS.map(windowSql).join(',')}
       FROM r
      GROUP BY ${dims.length ? `${dims.join(', ')}, ` : ''}CUBE (r.mode, r.urgency)`,
    params,
  );

  const labels = await groupLabels(m, rows, withCity, withService);
  const byKey = new Map<string, { raw: Raw[]; cityId: string | null; serviceId: string | null }>();
  for (const raw of rows) {
    const cityId = withCity ? String(raw.city_id) : null;
    const serviceId = withService ? String(raw.service_id) : null;
    const key = `${cityId}|${serviceId}`;
    if (!byKey.has(key)) byKey.set(key, { raw: [], cityId, serviceId });
    byKey.get(key)!.raw.push(raw);
  }
  // Sin dimensiones, el agregado devuelve una fila en cero cuando no hay pedidos: no es un grupo.
  const groups: ReportGroup[] = [...byKey.values()].filter(({ raw }) => raw.some((r) => n(r.sent) > 0)).map(({ raw, cityId, serviceId }) => {
    const parsed = raw.map(toRow);
    const total = parsed.find((r) => r.mode === null && r.urgency === null)!;
    const rest = parsed
      .filter((r) => r !== total)
      .sort((a, b) => b.sent - a.sent || String(a.mode).localeCompare(String(b.mode)) || String(a.urgency).localeCompare(String(b.urgency)));
    return {
      cityId,
      cityLabel: cityId ? labels.cities.get(cityId) ?? null : null,
      serviceId,
      serviceLabel: serviceId ? labels.services.get(serviceId) ?? null : null,
      rows: [total, ...rest],
    };
  });
  groups.sort(
    (a, b) =>
      b.rows[0].sent - a.rows[0].sent ||
      `${a.cityLabel}${a.serviceLabel}`.localeCompare(`${b.cityLabel}${b.serviceLabel}`),
  );
  return {
    from: opts.from.toISOString(),
    to: opts.to.toISOString(),
    now: now.toISOString(),
    by,
    groups,
    addProfessionals: await addProfessionalsStat(m, opts, now),
  };
}

/** Ventanas de "Sumar profesionales": se miden desde la primera vez que se sumó gente. */
export const ADD_WINDOWS_HOURS = [1, 24] as const;

async function addProfessionalsStat(m: Pick<EntityManager, 'query'>, opts: ReportOptions, now: Date): Promise<AddProfessionalsStat> {
  const params: unknown[] = [opts.from, opts.to, now];
  const filters: string[] = [];
  if (opts.cityId) filters.push(`AND sr.city_id = $${params.push(opts.cityId)}`);
  if (opts.serviceId) filters.push(`AND sr.service_id = $${params.push(opts.serviceId)}`);
  const win = (h: number) => {
    const due = `a.first_add_at + make_interval(hours => ${h})`;
    const inTime = `coalesce(a.first_after_at <= ${due}, false)`;
    const eligible = `(${due} <= $3 AND (a.cancelled_at IS NULL OR a.cancelled_at >= ${due} OR ${inTime}))`;
    return `count(*) FILTER (WHERE a.without_quote_at_add AND ${eligible})::int AS "eligible_${h}",
            count(*) FILTER (WHERE a.without_quote_at_add AND ${due} <= $3 AND ${inTime})::int AS "answered_${h}",
            count(*) FILTER (WHERE a.without_quote_at_add AND ${due} > $3)::int AS "not_yet_${h}",
            count(*) FILTER (WHERE a.without_quote_at_add AND ${due} <= $3 AND NOT ${eligible})::int AS "cancelled_early_${h}"`;
  };
  const [raw] = await m.query<Raw[]>(
    `WITH sent AS (
       SELECT sr.id, sr.cancelled_at, min(i.sent_at) AS sent_at,
              min(i.sent_at) FILTER (WHERE i.added_via IS NOT NULL) AS first_add_at,
              count(*) FILTER (WHERE i.added_via IS NOT NULL)::int AS added
         FROM service_requests sr JOIN request_invitations i ON i.request_id = sr.id
        WHERE sr.status::text <> 'DRAFT' ${filters.join(' ')}
        GROUP BY sr.id
       HAVING min(i.sent_at) >= $1 AND min(i.sent_at) < $2
     ), a AS (
       SELECT s.*,
              EXISTS (SELECT 1 FROM quotes q WHERE q.request_id = s.id AND q.created_at < s.first_add_at) AS quote_before,
              NOT EXISTS (SELECT 1 FROM quotes q WHERE q.request_id = s.id AND q.created_at < s.first_add_at) AS without_quote_at_add,
              (SELECT min(q.created_at) FROM quotes q WHERE q.request_id = s.id AND q.created_at >= s.first_add_at) AS first_after_at,
              (SELECT q.professional_id IN (SELECT i2.professional_id FROM request_invitations i2
                                              WHERE i2.request_id = s.id AND i2.added_via IS NOT NULL)
                 FROM quotes q WHERE q.request_id = s.id AND q.created_at >= s.first_add_at
                 ORDER BY q.created_at LIMIT 1) AS first_from_added
         FROM sent s WHERE s.first_add_at IS NOT NULL
     )
     SELECT (SELECT count(*)::int FROM sent) AS sent_requests,
            count(*)::int AS used,
            coalesce(sum(a.added), 0)::int AS added,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (a.first_add_at - a.sent_at)) / 60)::text AS median_minutes,
            count(*) FILTER (WHERE a.quote_before)::int AS quote_before,
            count(*) FILTER (WHERE a.without_quote_at_add)::int AS without_quote_at_add,
            count(*) FILTER (WHERE a.without_quote_at_add AND a.first_after_at IS NOT NULL)::int AS quote_after,
            count(*) FILTER (WHERE a.without_quote_at_add AND a.first_from_added)::int AS first_from_added,
            count(*) FILTER (WHERE a.without_quote_at_add AND a.first_after_at IS NULL AND a.cancelled_at IS NULL)::int AS still_without,
            count(*) FILTER (WHERE a.without_quote_at_add AND a.first_after_at IS NULL AND a.cancelled_at IS NOT NULL)::int AS cancelled_without,
            ${ADD_WINDOWS_HOURS.map(win).join(',')}
       FROM a`,
    params,
  );
  const r = raw ?? {};
  return {
    sentRequests: n(r.sent_requests),
    used: n(r.used),
    addedProfessionals: n(r.added),
    medianMinutesToFirstAdd: r.median_minutes == null ? null : Math.round(Number(r.median_minutes)),
    quoteBeforeAdd: n(r.quote_before),
    withoutQuoteAtAdd: n(r.without_quote_at_add),
    quoteAfterAdd: n(r.quote_after),
    firstQuoteFromAdded: n(r.first_from_added),
    stillWithoutQuote: n(r.still_without),
    cancelledWithoutQuote: n(r.cancelled_without),
    windows: ADD_WINDOWS_HOURS.map((hours) => ({
      hours: hours as ReportWindowHours,
      eligible: n(r[`eligible_${hours}`]),
      answered: n(r[`answered_${hours}`]),
      percent: percentOf(n(r[`answered_${hours}`]), n(r[`eligible_${hours}`])),
      notYetDue: n(r[`not_yet_${hours}`]),
      cancelledEarly: n(r[`cancelled_early_${hours}`]),
    })),
  };
}

function toRow(raw: Raw): ReportRow {
  return {
    mode: (raw.mode as ReportRow['mode']) ?? null,
    urgency: (raw.urgency as ReportRow['urgency']) ?? null,
    sent: n(raw.sent),
    withQuote: n(raw.with_quote),
    withoutQuote: n(raw.without_quote),
    withoutQuoteCancelled: n(raw.without_quote_cancelled),
    withoutQuoteOther: n(raw.without_quote_other),
    withoutQuoteOver72h: n(raw.without_quote_72h),
    onlyWithdrawnQuotes: n(raw.only_withdrawn),
    cancelled: n(raw.cancelled),
    windows: REPORT_WINDOWS_HOURS.map((hours) => ({
      hours,
      eligible: n(raw[`eligible_${hours}`]),
      answered: n(raw[`answered_${hours}`]),
      percent: percentOf(n(raw[`answered_${hours}`]), n(raw[`eligible_${hours}`])),
      notYetDue: n(raw[`not_yet_${hours}`]),
      cancelledEarly: n(raw[`cancelled_early_${hours}`]),
    })),
    medianMinutes: raw.median_minutes === null || raw.median_minutes === undefined ? null : Math.round(Number(raw.median_minutes)),
    accepted: n(raw.accepted),
    completed: n(raw.completed),
  };
}

async function groupLabels(m: Pick<EntityManager, 'query'>, rows: Raw[], withCity: boolean, withService: boolean) {
  const cities = new Map<string, string>();
  const services = new Map<string, string>();
  const cityIds = [...new Set(rows.map((r) => r.city_id).filter(Boolean))] as string[];
  const serviceIds = [...new Set(rows.map((r) => r.service_id).filter(Boolean))] as string[];
  if (withCity && cityIds.length) {
    const found = await m.query(
      `SELECT c.id, c.name, p.name AS province FROM cities c JOIN provinces p ON p.id = c.province_id WHERE c.id = ANY($1::uuid[])`,
      [cityIds],
    );
    for (const c of found as { id: string; name: string; province: string }[]) cities.set(c.id, `${c.name} (${c.province})`);
  }
  if (withService && serviceIds.length) {
    const found = await m.query(`SELECT id, name FROM services WHERE id = ANY($1::uuid[])`, [serviceIds]);
    for (const s of found as { id: string; name: string }[]) services.set(s.id, s.name);
  }
  return { cities, services };
}

// ---- Texto ----------------------------------------------------------------------------------

const MODE: Record<string, string> = { DISCOVERY: 'Búsqueda', DIRECTED: 'Dirigido' };
const URGENCY: Record<string, string> = { FLEXIBLE: 'normal', TODAY: 'para hoy', URGENT: 'urgente' };

export const rowLabel = (r: Pick<ReportRow, 'mode' | 'urgency'>): string =>
  r.mode === null && r.urgency === null
    ? 'Todos los pedidos'
    : [r.mode ? MODE[r.mode] : 'Todos los modos', r.urgency ? URGENCY[r.urgency] : 'toda urgencia'].join(' · ');

export function formatDuration(minutes: number | null): string {
  if (minutes === null) return 'sin dato';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

const pctText = (p: number | null) => (p === null ? '—' : `${p} %`);

/** Notas que acompañan siempre al reporte: cómo se cuenta cada cosa y qué no dice. */
export const REPORT_NOTES = [
  'Pedido enviado = salió de borrador (tiene al menos una invitación). Los borradores no cuentan.',
  'Período y "hora de envío" = primera invitación del pedido (horario de Argentina para --from/--to).',
  'Cada ventana (1, 24 y 72 h) usa como base solo los pedidos enviados hace tanto tiempo o más: los más recientes se informan aparte ("sin tiempo todavía").',
  'Cancelaciones: un pedido cancelado ANTES de cumplirse la ventana y sin presupuesto no se cuenta como sin respuesta; se informa aparte. Si ya tenía presupuesto a tiempo, cuenta como respondido.',
  'Presupuestos retirados: el primer presupuesto cuenta aunque después se retire o venza (la respuesta ocurrió); los pedidos con todos sus presupuestos retirados se informan aparte.',
  'La mediana es sobre los pedidos con presupuesto; los que no tienen se muestran al lado. Con muchos pedidos sin respuesta o recientes, la mediana subestima la espera.',
  'Aceptados y completados: hasta hoy, sobre los pedidos enviados del período; los recientes todavía pueden llegar a serlo.',
  'Este reporte cuenta qué pasó, no por qué: no hay datos para atribuir causas a la falta de respuesta.',
  '"Sumar profesionales": pedidos del período donde el cliente sumó gente después del envío. Los porcentajes se miden desde esa acción y solo sobre los pedidos que no tenían presupuesto en ese momento. Es descriptivo: no hay un grupo comparable (quien la usa es quien no recibió respuesta), así que no demuestra que sumar profesionales haya causado el presupuesto.',
] as const;

export function formatReport(report: MarketplaceReport): string {
  const day = (iso: string) => iso.slice(0, 10);
  const out: string[] = [
    `Pedidos enviados entre ${day(report.from)} y ${day(report.to)} (medido al ${report.now.slice(0, 16).replace('T', ' ')} UTC)`,
  ];
  if (!report.groups.length) out.push('', 'No hay pedidos enviados en el período.');
  for (const g of report.groups) {
    const title = [g.cityLabel, g.serviceLabel].filter(Boolean).join(' · ');
    out.push('', title ? `== ${title} ==` : '== Todas las ciudades y servicios ==');
    for (const r of g.rows) {
      out.push(`${rowLabel(r)}: ${r.sent} enviados`);
      out.push(
        `  con presupuesto ${r.withQuote} · sin presupuesto ${r.withoutQuote}` +
          ` (cancelados ${r.withoutQuoteCancelled}, otros ${r.withoutQuoteOther}, de esos con 72 h o más ${r.withoutQuoteOver72h})` +
          ` · solo presupuestos retirados ${r.onlyWithdrawnQuotes} · cancelados en total ${r.cancelled}`,
      );
      for (const w of r.windows) {
        out.push(
          `  primer presupuesto en ${w.hours} h: ${w.answered} de ${w.eligible} (${pctText(w.percent)})` +
            ` · sin tiempo todavía ${w.notYetDue} · cancelados antes ${w.cancelledEarly}`,
        );
      }
      out.push(
        `  mediana hasta el primer presupuesto: ${formatDuration(r.medianMinutes)} (sobre ${r.withQuote} con presupuesto; ${r.withoutQuote} sin presupuesto)`,
      );
      out.push(`  presupuestos aceptados ${r.accepted} · trabajos completados ${r.completed}`);
    }
  }
  const a = report.addProfessionals;
  out.push('', '== Sumar profesionales ==');
  if (!a.used) {
    out.push(`Ningún pedido enviado en el período (de ${a.sentRequests}) usó "Sumar profesionales".`);
  } else {
    out.push(
      `Pedidos que la usaron: ${a.used} de ${a.sentRequests} enviados (${pctText(percentOf(a.used, a.sentRequests))}) · profesionales sumados ${a.addedProfessionals}` +
        ` · mediana hasta sumar: ${formatDuration(a.medianMinutesToFirstAdd)}`,
    );
    out.push(`  ya tenían presupuesto al sumar ${a.quoteBeforeAdd} · sin presupuesto al sumar ${a.withoutQuoteAtAdd}`);
    out.push(
      `  de esos ${a.withoutQuoteAtAdd}: con presupuesto después ${a.quoteAfterAdd} (el primero de un profesional sumado: ${a.firstQuoteFromAdded})` +
        ` · todavía sin presupuesto ${a.stillWithoutQuote} · cancelados sin presupuesto ${a.cancelledWithoutQuote}`,
    );
    for (const w of a.windows) {
      out.push(
        `  primer presupuesto dentro de ${w.hours} h de sumar: ${w.answered} de ${w.eligible} (${pctText(w.percent)})` +
          ` · sin tiempo todavía ${w.notYetDue} · cancelados antes ${w.cancelledEarly}`,
      );
    }
  }
  out.push('', 'Cómo leerlo:');
  for (const note of REPORT_NOTES) out.push(`- ${note}`);
  return out.join('\n');
}
