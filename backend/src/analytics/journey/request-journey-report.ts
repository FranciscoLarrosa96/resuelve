import type { EntityManager } from 'typeorm';
import { type Journey, JOURNEYS, OBSERVATION_WINDOW_HOURS, STEP_LABELS } from './request-journey';

/** Una fila agrupada: intentos con las mismas banderas (SQL agrega, TypeScript interpreta). */
export interface AttemptGroup {
  journey: Journey | null;
  /** El intento empezó hace menos que la ventana: todavía puede completarse. */
  recent: boolean;
  /** Tuvo actividad dentro de la ventana y todavía no se envió. */
  active: boolean;
  steps: boolean[]; // vio el paso 0..4
  quote: boolean;
  authRequired: boolean;
  authReturned: boolean;
  sent: boolean;
  entry: string | null;
  count: number;
}

export interface StageRow {
  key: string;
  label: string;
  /** Intentos que llegaron a esta etapa o a una posterior. */
  reached: number;
  /** % de la etapa anterior (null sin denominador o en la primera). */
  ofPrevious: number | null;
  /** % de los que empezaron. */
  ofStarted: number | null;
}

export interface JourneyReport {
  journey: Journey;
  /** Intentos maduros (empezaron hace más que la ventana): la base de todos los porcentajes. */
  attempts: number;
  stages: StageRow[];
  auth: { required: number; returned: number; sentAfterReturn: number; returnedOfRequired: number | null; sentOfReturned: number | null };
  outcome: { sent: number; noSendAfterWindow: number; stillActive: number };
  /** Solo DIRECT y COMPARE: pasaron por /solicitud para editar el pedido (no es un paso del recorrido). */
  editedRequest: number | null;
  entries: { entry: string; attempts: number }[];
  /** Empezaron hace menos que la ventana: no entran en los porcentajes. */
  recent: { attempts: number; sent: number };
}

export interface RequestJourneyReport {
  from: string;
  to: string;
  now: string;
  windowHours: number;
  journeys: JourneyReport[];
  /** Envíos confirmados por el servidor sin ningún evento previo del navegador (bloqueador, evento perdido, pestaña vieja). */
  sentWithoutBrowserEvents: number;
  totalSent: number;
}

const pct = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

/** Etapas EN ORDEN de cada recorrido: los pasos de /solicitud solo existen en REQUEST. */
function stagesOf(journey: Journey): { key: string; label: string; reached: (g: AttemptGroup) => boolean }[] {
  const started = { key: 'started', label: 'Empezaron el pedido', reached: () => true };
  const quote = {
    key: 'quote',
    label: 'Llegaron a la pantalla de envío',
    reached: (g: AttemptGroup) => g.quote || g.sent,
  };
  const sent = { key: 'sent', label: 'Envío confirmado (invitaciones enviadas)', reached: (g: AttemptGroup) => g.sent };
  if (journey !== 'REQUEST') return [started, quote, sent];
  const steps = STEP_LABELS.map((label, i) => ({
    key: `step${i}`,
    label: `Vieron el paso ${i + 1}: ${label}`,
    // Llegó al paso o a uno posterior (si salta pasos, igual lo pasó).
    reached: (g: AttemptGroup) => g.steps.slice(i).some(Boolean) || g.quote || g.sent,
  }));
  return [started, ...steps, quote, sent];
}

export function buildReport(
  groups: AttemptGroup[],
  meta: { from: Date; to: Date; now: Date; windowHours: number; sentWithoutBrowserEvents: number; totalSent: number },
): RequestJourneyReport {
  const journeys = JOURNEYS.map((journey): JourneyReport => {
    const mine = groups.filter((g) => g.journey === journey);
    const mature = mine.filter((g) => !g.recent);
    const sum = (list: AttemptGroup[], f: (g: AttemptGroup) => boolean) =>
      list.filter(f).reduce((n, g) => n + g.count, 0);
    const attempts = sum(mature, () => true);
    let previous: number | null = null;
    const stages = stagesOf(journey).map((s): StageRow => {
      const reached = sum(mature, s.reached);
      const row = { key: s.key, label: s.label, reached, ofPrevious: previous === null ? null : pct(reached, previous), ofStarted: pct(reached, attempts) };
      previous = reached;
      return row;
    });
    const required = sum(mature, (g) => g.authRequired);
    const returned = sum(mature, (g) => g.authRequired && g.authReturned);
    const entries = new Map<string, number>();
    for (const g of mature) if (g.entry) entries.set(g.entry, (entries.get(g.entry) ?? 0) + g.count);
    const sent = sum(mature, (g) => g.sent);
    const stillActive = sum(mature, (g) => !g.sent && g.active);
    return {
      journey,
      attempts,
      stages,
      auth: {
        required,
        returned,
        sentAfterReturn: sum(mature, (g) => g.authRequired && g.authReturned && g.sent),
        returnedOfRequired: pct(returned, required),
        sentOfReturned: pct(sum(mature, (g) => g.authRequired && g.authReturned && g.sent), returned),
      },
      outcome: { sent, noSendAfterWindow: attempts - sent - stillActive, stillActive },
      editedRequest: journey === 'REQUEST' ? null : sum(mature, (g) => g.steps.some(Boolean)),
      entries: [...entries].map(([entry, n]) => ({ entry, attempts: n })).sort((a, b) => b.attempts - a.attempts),
      recent: { attempts: sum(mine.filter((g) => g.recent), () => true), sent: sum(mine.filter((g) => g.recent), (g) => g.sent) },
    };
  });
  return {
    from: meta.from.toISOString(),
    to: meta.to.toISOString(),
    now: meta.now.toISOString(),
    windowHours: meta.windowHours,
    journeys,
    sentWithoutBrowserEvents: meta.sentWithoutBrowserEvents,
    totalSent: meta.totalSent,
  };
}

/**
 * Solo lectura. Un intento pertenece al período por su PRIMER evento del navegador.
 * El recorrido y la entrada salen de STARTED (o del primer evento si se perdió).
 */
export async function requestJourneyReport(
  m: Pick<EntityManager, 'query'>,
  opts: { from: Date; to: Date; now?: Date; windowHours?: number },
): Promise<RequestJourneyReport> {
  const now = opts.now ?? new Date();
  const windowHours = opts.windowHours ?? OBSERVATION_WINDOW_HOURS;
  const rows = await m.query<Record<string, unknown>[]>(
    `WITH a AS (
       SELECT attempt_id,
              min(occurred_at) AS started_at,
              max(occurred_at) AS last_at,
              (array_agg(journey ORDER BY (type = 'STARTED') DESC, occurred_at) FILTER (WHERE journey IS NOT NULL))[1] AS journey,
              max(entry) FILTER (WHERE type = 'STARTED') AS entry,
              coalesce(bool_or(type = 'STEP_VIEWED' AND step = 0), false) AS s0,
              coalesce(bool_or(type = 'STEP_VIEWED' AND step = 1), false) AS s1,
              coalesce(bool_or(type = 'STEP_VIEWED' AND step = 2), false) AS s2,
              coalesce(bool_or(type = 'STEP_VIEWED' AND step = 3), false) AS s3,
              coalesce(bool_or(type = 'STEP_VIEWED' AND step = 4), false) AS s4,
              bool_or(type = 'QUOTE_VIEWED') AS quote,
              bool_or(type = 'AUTH_REQUIRED') AS auth_required,
              bool_or(type = 'AUTH_RETURNED') AS auth_returned,
              bool_or(type = 'SENT') AS sent
         FROM request_journey_events
        GROUP BY attempt_id
     )
     SELECT journey, entry, s0, s1, s2, s3, s4, quote, auth_required, auth_returned, sent,
            (started_at > $3::timestamptz - make_interval(hours => $4)) AS recent,
            (last_at > $3::timestamptz - make_interval(hours => $4)) AS active,
            count(*)::int AS count
       FROM a
      WHERE journey IS NOT NULL AND started_at >= $1 AND started_at < $2
      GROUP BY 1,2,3,4,5,6,7,8,9,10,11,12,13`,
    [opts.from, opts.to, now, windowHours],
  );
  const [totals] = await m.query<{ total: number; orphans: number }[]>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE NOT EXISTS (
              SELECT 1 FROM request_journey_events c WHERE c.attempt_id = s.attempt_id AND c.type <> 'SENT'))::int AS orphans
       FROM request_journey_events s
      WHERE s.type = 'SENT' AND s.occurred_at >= $1 AND s.occurred_at < $2`,
    [opts.from, opts.to],
  );
  const groups: AttemptGroup[] = rows.map((r) => ({
    journey: r.journey as Journey,
    entry: (r.entry as string | null) ?? null,
    recent: r.recent as boolean,
    active: r.active as boolean,
    steps: [r.s0, r.s1, r.s2, r.s3, r.s4].map(Boolean),
    quote: !!r.quote,
    authRequired: !!r.auth_required,
    authReturned: !!r.auth_returned,
    sent: !!r.sent,
    count: Number(r.count),
  }));
  return buildReport(groups, {
    from: opts.from,
    to: opts.to,
    now,
    windowHours,
    sentWithoutBrowserEvents: totals?.orphans ?? 0,
    totalSent: totals?.total ?? 0,
  });
}

const JOURNEY_TITLES: Record<Journey, string> = {
  REQUEST: 'Recorrido 1 · Arma el pedido paso a paso (/solicitud)',
  DIRECT: 'Recorrido 2 · Pedido dirigido a un profesional (perfil, tarjeta, recontratar)',
  COMPARE: 'Recorrido 3 · Varios elegidos desde resultados, urgencias o sugeridos',
};

const fmt = (v: number | null) => (v === null ? '—' : `${v} %`);

export function formatReport(r: RequestJourneyReport): string {
  const out: string[] = [
    `Recorrido del pedido del cliente · intentos que empezaron entre ${r.from.slice(0, 10)} y ${r.to.slice(0, 10)}`,
    `Ventana de observación: ${r.windowHours} h sin actividad. Pasada la ventana, un intento sin envío es "sin envío registrado":`,
    'NO es un abandono confirmado (puede haber seguido en otro dispositivo, por WhatsApp o sin eventos por un bloqueador).',
    'Los porcentajes usan solo intentos que empezaron hace más que la ventana; los recientes se muestran aparte.',
    '',
  ];
  for (const j of r.journeys) {
    out.push(JOURNEY_TITLES[j.journey], `  Intentos considerados: ${j.attempts}`);
    for (const s of j.stages) {
      const label = s.label.padEnd(46);
      out.push(
        `  ${label} ${String(s.reached).padStart(5)}   ${s.ofPrevious === null ? '' : `${fmt(s.ofPrevious)} de la etapa anterior`}${s.ofPrevious === null ? '' : ' · '}${fmt(s.ofStarted)} de los que empezaron`.trimEnd(),
      );
    }
    if (j.editedRequest !== null) out.push(`  Editaron el pedido en /solicitud (informativo, no es una etapa): ${j.editedRequest}`);
    out.push(
      `  Pidieron ingresar: ${j.auth.required} · volvieron autenticados: ${j.auth.returned} (${fmt(j.auth.returnedOfRequired)}) · enviaron tras volver: ${j.auth.sentAfterReturn} (${fmt(j.auth.sentOfReturned)} de los que volvieron)`,
      `  Resultado: ${j.outcome.sent} con envío · ${j.outcome.noSendAfterWindow} sin envío registrado tras la ventana · ${j.outcome.stillActive} con actividad reciente`,
    );
    if (j.entries.length) out.push(`  Cómo llegaron: ${j.entries.map((e) => `${e.entry} ${e.attempts}`).join(' · ')}`);
    out.push(`  Recientes (aún pueden completarse, fuera de los %): ${j.recent.attempts} (${j.recent.sent} ya enviados)`, '');
  }
  out.push(
    `Envíos confirmados por el servidor en el período: ${r.totalSent}`,
    `  de ellos, sin ningún evento previo del navegador: ${r.sentWithoutBrowserEvents} (no entran en los recorridos)`,
  );
  return out.join('\n');
}
