import type { EntityManager } from 'typeorm';
import { FLOW_VERSIONS, type FlowVersion, type Journey, JOURNEYS, OBSERVATION_WINDOW_HOURS, STEP_LABELS_BY_VERSION } from './request-journey';

/** Una fila agrupada: intentos con las mismas banderas (SQL agrega, TypeScript interpreta). */
export interface AttemptGroup {
  journey: Journey | null;
  /** Interfaz de los eventos del navegador del intento; 'MIXED' si emitieron las dos. */
  version: FlowVersion | 'MIXED';
  /** El intento empezó hace menos que la ventana: todavía puede completarse. */
  recent: boolean;
  /** Tuvo actividad dentro de la ventana y todavía no se envió. */
  active: boolean;
  steps: boolean[]; // vio el paso 0..4 (hasta el 3 en la versión 2)
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
  /** Interfaz de la que habla este bloque: sus etapas y sus porcentajes no se suman con los de la otra. */
  flowVersion: FlowVersion;
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

/** Intentos con eventos de las dos interfaces (p. ej. un borrador de la 1 retomado en la 2): solo cantidades. */
export interface MixedRow {
  journey: Journey;
  attempts: number;
  reachedQuote: number;
  sent: number;
  recent: { attempts: number; sent: number };
}

/** Los extremos que existen en las dos versiones (inicio → pantalla de envío → envío), lado a lado. */
export interface ComparisonRow {
  journey: Journey;
  versions: {
    flowVersion: FlowVersion;
    attempts: number;
    reachedQuote: number;
    sent: number;
    quoteOfStarted: number | null;
    sentOfStarted: number | null;
    sentOfQuote: number | null;
  }[];
}

export interface RequestJourneyReport {
  from: string;
  to: string;
  now: string;
  windowHours: number;
  /** Un bloque por recorrido y versión (V1 y V2 separadas). */
  journeys: JourneyReport[];
  mixed: MixedRow[];
  comparison: ComparisonRow[];
  /** Envíos confirmados por el servidor sin ningún evento previo del navegador (bloqueador, evento perdido, pestaña vieja). */
  sentWithoutBrowserEvents: number;
  totalSent: number;
}

const pct = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

/** Etapas EN ORDEN de cada recorrido: los pasos de /solicitud solo existen en REQUEST. */
function stagesOf(journey: Journey, version: FlowVersion): { key: string; label: string; reached: (g: AttemptGroup) => boolean }[] {
  const started = { key: 'started', label: 'Empezaron el pedido', reached: () => true };
  const quote = {
    key: 'quote',
    label: 'Llegaron a la pantalla de envío',
    reached: (g: AttemptGroup) => g.quote || g.sent,
  };
  const sent = { key: 'sent', label: 'Envío confirmado (invitaciones enviadas)', reached: (g: AttemptGroup) => g.sent };
  if (journey !== 'REQUEST') return [started, quote, sent];
  const steps = STEP_LABELS_BY_VERSION[version].map((label, i) => ({
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
  const sum = (list: AttemptGroup[], f: (g: AttemptGroup) => boolean) =>
    list.filter(f).reduce((n, g) => n + g.count, 0);
  const journeys = JOURNEYS.flatMap((journey) =>
    FLOW_VERSIONS.map((flowVersion): JourneyReport => {
      const mine = groups.filter((g) => g.journey === journey && g.version === flowVersion);
      const mature = mine.filter((g) => !g.recent);
      const attempts = sum(mature, () => true);
      let previous: number | null = null;
      const stages = stagesOf(journey, flowVersion).map((s): StageRow => {
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
        flowVersion,
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
    }),
  );
  const mixed = JOURNEYS.map((journey): MixedRow => {
    const mine = groups.filter((g) => g.journey === journey && g.version === 'MIXED');
    const mature = mine.filter((g) => !g.recent);
    return {
      journey,
      attempts: sum(mature, () => true),
      reachedQuote: sum(mature, (g) => g.quote || g.sent),
      sent: sum(mature, (g) => g.sent),
      recent: { attempts: sum(mine.filter((g) => g.recent), () => true), sent: sum(mine.filter((g) => g.recent), (g) => g.sent) },
    };
  });
  const comparison = JOURNEYS.map((journey): ComparisonRow => ({
    journey,
    versions: FLOW_VERSIONS.map((flowVersion) => {
      const j = journeys.find((x) => x.journey === journey && x.flowVersion === flowVersion)!;
      const at = (key: string) => j.stages.find((st) => st.key === key)!.reached;
      return {
        flowVersion,
        attempts: j.attempts,
        reachedQuote: at('quote'),
        sent: at('sent'),
        quoteOfStarted: pct(at('quote'), j.attempts),
        sentOfStarted: pct(at('sent'), j.attempts),
        sentOfQuote: pct(at('sent'), at('quote')),
      };
    }),
  }));
  return {
    from: meta.from.toISOString(),
    to: meta.to.toISOString(),
    now: meta.now.toISOString(),
    windowHours: meta.windowHours,
    journeys,
    mixed,
    comparison,
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
              bool_or(type = 'SENT') AS sent,
              coalesce(bool_or(flow_version = 1), false) AS v1,
              coalesce(bool_or(flow_version = 2), false) AS v2
         FROM request_journey_events
        GROUP BY attempt_id
     )
     SELECT journey, entry, s0, s1, s2, s3, s4, quote, auth_required, auth_returned, sent, v1, v2,
            (started_at > $3::timestamptz - make_interval(hours => $4)) AS recent,
            (last_at > $3::timestamptz - make_interval(hours => $4)) AS active,
            count(*)::int AS count
       FROM a
      WHERE journey IS NOT NULL AND started_at >= $1 AND started_at < $2
      GROUP BY 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15`,
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
    // Dos interfaces en el mismo intento = MIXTO; sin versión (no debería pasar) se lee como la 1.
    version: r.v1 && r.v2 ? 'MIXED' : r.v2 ? 2 : 1,
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

const VERSION_TITLES: Record<FlowVersion, string> = {
  1: 'V1 · asistente de 5 pasos (todo lo medido hasta el cambio)',
  2: 'V2 · asistente de 4 pasos (urgencia y fecha juntas)',
};

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
    'V1 y V2 tienen pasos distintos: se informan por separado y sus porcentajes no se suman.',
    '',
  ];
  for (const j of r.journeys) {
    out.push(`${JOURNEY_TITLES[j.journey]} — ${VERSION_TITLES[j.flowVersion]}`, `  Intentos considerados: ${j.attempts}`);
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
    'MIXTO · intentos con eventos de las dos interfaces (p. ej. un borrador de V1 retomado en V2).',
    'Solo cantidades: quedan fuera de los porcentajes de V1 y de V2.',
  );
  for (const m of r.mixed) {
    out.push(
      `  ${JOURNEY_TITLES[m.journey].split(' · ')[0]}: ${m.attempts} intentos · ${m.reachedQuote} llegaron a la pantalla de envío · ${m.sent} con envío confirmado · recientes ${m.recent.attempts} (${m.recent.sent} enviados)`,
    );
  }
  out.push(
    '',
    'Extremos equivalentes (inicio → pantalla de envío → envío confirmado), V1 y V2 lado a lado.',
    'Es descriptivo: son períodos y personas distintos, no hay asignación al azar y NO prueba que una versión cause la diferencia.',
  );
  for (const c of r.comparison) {
    out.push(`  ${JOURNEY_TITLES[c.journey].split(' · ')[0]}`);
    for (const v of c.versions) {
      out.push(
        `    V${v.flowVersion}: ${v.attempts} empezaron · ${v.reachedQuote} a la pantalla de envío (${fmt(v.quoteOfStarted)}) · ${v.sent} con envío (${fmt(v.sentOfStarted)} de los que empezaron; ${fmt(v.sentOfQuote)} de los que llegaron a la pantalla de envío)`,
      );
    }
  }
  out.push('');
  out.push(
    `Envíos confirmados por el servidor en el período: ${r.totalSent}`,
    `  de ellos, sin ningún evento previo del navegador: ${r.sentWithoutBrowserEvents} (no entran en los recorridos)`,
  );
  return out.join('\n');
}
