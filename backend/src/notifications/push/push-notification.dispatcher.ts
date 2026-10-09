import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { NotificationType } from '../notification.entity';
import { notificationRoute } from '../notifications.service';
import { PUSH_COPY, PUSH_URGENT_COPY, PushCopy, URGENT_PUSH_TYPES, pushSummaryCopy } from './push-copy';
import { PUSH_SENDER, PushSender } from './push-sender';

/** Intentos por aviso antes de darlo por FAILED (siempre queda en la app). */
const MAX_ATTEMPTS = 3;
/** Un aviso con más horas que esto ya no urge (cubre la noche de silencio, 23 → 8). */
const STALE_HOURS = 12;
const BATCH = 200;
/** Después de tantos errores seguidos (que no sean 404/410) se descarta el dispositivo. */
const MAX_SUBSCRIPTION_FAILURES = 5;

interface Claimed {
  id: string;
  user_id: string;
  type: NotificationType;
  request_id: string | null;
  job_id: string | null;
  read_at: Date | null;
  created_at: Date;
  push_attempts: number;
  urgent: boolean;
}

interface Subscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushDispatchResult {
  sent: number;
  skipped: number;
  failed: number;
  /** Horario de silencio: solo salieron urgencias; lo demás sale junto a la mañana. */
  quiet: boolean;
}

/** Hora de Argentina dentro del silencio [start, end). start = end → sin silencio. */
export function isQuietHour(now: Date, start: number, end: number): boolean {
  if (start === end) return false;
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' }).format(now),
  );
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/**
 * En el horario de silencio solo sale una solicitud URGENT a quien sigue tomando
 * urgencias ahora ("Tomo urgencias"): lo prendió para eso. Mismo criterio que
 * `isTakingUrgencies` (alias `n` = notifications).
 */
const URGENT_ONLY_SQL = `
  n.type = ANY($2::notification_type[])
  AND EXISTS (SELECT 1 FROM service_requests r WHERE r.id = n.request_id AND r.urgency = 'URGENT')
  AND EXISTS (SELECT 1 FROM professional_profiles p
               WHERE p.user_id = n.user_id AND p.available_until IS NOT NULL AND p.available_until > now())`;

/** Lo que entiende el service worker de Angular: muestra el aviso y, al tocarlo, abre `url`. */
export function pushPayload(copy: PushCopy, url: string, tag: string): string {
  return JSON.stringify({
    notification: {
      title: copy.title,
      body: copy.body,
      icon: '/icon-192.png',
      badge: '/favicon-64.png',
      lang: 'es-AR',
      tag,
      data: { onActionClick: { default: { operation: 'navigateLastFocusedOrOpen', url } } },
    },
  });
}

/**
 * Manda como push las notificaciones in-app nuevas. La notificación sigue
 * siendo la fuente: acá solo se decide si corresponde y se entrega.
 *
 * - Un aviso por persona y ciclo (varias novedades = "Tenés N novedades").
 * - No manda lo ya leído, lo que no está en `PUSH_COPY`, lo viejo ni a quien
 *   no tiene dispositivos. Respeta `availableAt` (oportunidad Free demorada).
 * - Horario de silencio (Argentina): solo salen urgencias a quien toma
 *   urgencias (`URGENT_ONLY_SQL`); el resto sale al terminar.
 * - Reclamo atómico (`FOR UPDATE SKIP LOCKED`): dos ciclos no mandan lo mismo.
 * - 404/410 del servicio de push = el dispositivo ya no existe: se borra.
 */
@Injectable()
export class PushNotificationDispatcher {
  private readonly logger = new Logger('PushNotifications');

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    @Inject(PUSH_SENDER) private readonly sender: PushSender,
  ) {}

  async dispatch(now = new Date()): Promise<PushDispatchResult> {
    const result: PushDispatchResult = { sent: 0, skipped: 0, failed: 0, quiet: false };
    if (!this.sender.configured) return result;
    result.quiet = isQuietHour(
      now,
      this.config.get<number>('PUSH_QUIET_START_HOUR', 23),
      this.config.get<number>('PUSH_QUIET_END_HOUR', 8),
    );

    await this.dataSource.query(
      `UPDATE notifications SET push_status = 'FAILED'
        WHERE push_status = 'SENDING' AND pushed_at < now() - interval '10 minutes' AND push_attempts >= $1`,
      [MAX_ATTEMPTS],
    );
    const claimed = (
      await this.dataSource.query(
        `UPDATE notifications n
            SET push_status = 'SENDING', pushed_at = now(), push_attempts = n.push_attempts + 1
          WHERE n.id IN (
            SELECT n.id FROM notifications n
             WHERE (n.push_status IS NULL
                    OR (n.push_status = 'SENDING' AND n.pushed_at < now() - interval '10 minutes'))
               AND (n.available_at IS NULL OR n.available_at <= now())
               ${result.quiet ? `AND ${URGENT_ONLY_SQL}` : ''}
             ORDER BY n.created_at
             LIMIT $1
             FOR UPDATE SKIP LOCKED)
        RETURNING n.id, n.user_id, n.type, n.request_id, n.read_at, n.created_at, n.push_attempts,
                  (SELECT j.id FROM jobs j WHERE j.request_id = n.request_id) AS job_id,
                  (n.type = ANY($2::notification_type[]) AND EXISTS (
                     SELECT 1 FROM service_requests r WHERE r.id = n.request_id AND r.urgency = 'URGENT')) AS urgent`,
        [BATCH, URGENT_PUSH_TYPES],
      )
    )[0] as Claimed[];
    if (claimed.length === 0) return result;

    const byUser = new Map<string, Claimed[]>();
    for (const n of claimed) byUser.set(n.user_id, [...(byUser.get(n.user_id) ?? []), n]);
    const subs: Subscription[] = await this.dataSource.query(
      `SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY($1::uuid[])`,
      [[...byUser.keys()]],
    );
    const subsByUser = new Map<string, Subscription[]>();
    for (const s of subs) subsByUser.set(s.user_id, [...(subsByUser.get(s.user_id) ?? []), s]);
    const staleBefore = now.getTime() - STALE_HOURS * 3600_000;

    for (const [userId, items] of byUser) {
      const devices = subsByUser.get(userId) ?? [];
      const eligible = items.filter(
        (n) => !!PUSH_COPY[n.type] && n.read_at === null && new Date(n.created_at).getTime() >= staleBefore && devices.length > 0,
      );
      const skip = items.filter((n) => !eligible.includes(n)).map((n) => n.id);
      if (skip.length) {
        await this.mark(skip, 'SKIPPED');
        result.skipped += skip.length;
      }
      if (eligible.length === 0) continue;

      const newest = [...eligible].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      const url = notificationRoute(newest.type, { requestId: newest.request_id, jobId: newest.job_id });
      const payload =
        eligible.length === 1
          ? pushPayload(newest.urgent ? PUSH_URGENT_COPY : PUSH_COPY[newest.type]!, url, newest.request_id ?? newest.id)
          : pushPayload(pushSummaryCopy(eligible.length), url, 'resuelve-novedades');

      let delivered = false;
      for (const device of devices) {
        const res = await this.sender.send(device, payload);
        if (res.ok) {
          delivered = true;
          await this.dataSource.query(
            `UPDATE push_subscriptions SET failures = 0, last_success_at = now() WHERE id = $1`,
            [device.id],
          );
        } else if (res.gone) {
          await this.dataSource.query(`DELETE FROM push_subscriptions WHERE id = $1`, [device.id]);
        } else {
          // Sin el endpoint ni el contenido en el log: solo la causa.
          this.logger.warn(`no se pudo enviar un push: ${res.reason}`);
          const [[row]] = await this.dataSource.query(
            `UPDATE push_subscriptions SET failures = failures + 1 WHERE id = $1 RETURNING failures`,
            [device.id],
          );
          if (row && row.failures >= MAX_SUBSCRIPTION_FAILURES) {
            await this.dataSource.query(`DELETE FROM push_subscriptions WHERE id = $1`, [device.id]);
          }
        }
      }

      const ids = eligible.map((n) => n.id);
      if (delivered) {
        await this.mark(ids, 'SENT');
        result.sent += ids.length;
        continue;
      }
      // Ningún dispositivo lo recibió: se reintenta (si quedan dispositivos e intentos) o queda solo en la app.
      const stillHasDevices = (
        await this.dataSource.query(`SELECT 1 FROM push_subscriptions WHERE user_id = $1 LIMIT 1`, [userId])
      ).length > 0;
      const retry = stillHasDevices ? eligible.filter((n) => n.push_attempts < MAX_ATTEMPTS).map((n) => n.id) : [];
      const dead = ids.filter((id) => !retry.includes(id));
      if (retry.length) await this.release(retry);
      if (dead.length) await this.mark(dead, stillHasDevices ? 'FAILED' : 'SKIPPED');
      result.failed += ids.length;
    }
    return result;
  }

  private mark(ids: string[], status: 'SENT' | 'SKIPPED' | 'FAILED'): Promise<unknown> {
    return this.dataSource.query(
      `UPDATE notifications SET push_status = $2, pushed_at = now() WHERE id = ANY($1::uuid[])`,
      [ids, status],
    );
  }

  private release(ids: string[]): Promise<unknown> {
    return this.dataSource.query(
      `UPDATE notifications SET push_status = NULL, pushed_at = NULL WHERE id = ANY($1::uuid[])`,
      [ids],
    );
  }
}
