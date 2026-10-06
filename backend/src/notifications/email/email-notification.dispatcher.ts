import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { EmailService } from '../../email/email.service';
import { EMAIL_NOTICE_COPY } from './email-notification-copy';
import { createUnsubscribeToken } from './unsubscribe-token';

/** Intentos de envío por aviso antes de darlo por FAILED (siempre queda en la app). */
const MAX_ATTEMPTS = 3;
/** Un aviso con más horas que esto ya no urge: no se manda (si el SMTP estuvo caído, no llega tarde). */
const STALE_HOURS = 24;
const BATCH = 200;

interface Claimed {
  id: string;
  user_id: string;
  type: string;
  request_id: string | null;
  read_at: Date | null;
  created_at: Date;
  email_attempts: number;
}

export interface DispatchResult {
  sent: number;
  skipped: number;
  failed: number;
  /** Avisos que quedan para el próximo ciclo (tope diario global). */
  deferred: number;
}

/**
 * Manda por email las notificaciones in-app nuevas. La notificación sigue
 * siendo la fuente: acá solo se decide si corresponde mandarla y se entrega.
 *
 * - Un mensaje por persona y ciclo (varias novedades = un resumen).
 * - No manda lo que ya se leyó, lo que no urge (`EMAIL_NOTICE_COPY`), lo viejo
 *   ni a quien se dio de baja. Respeta `availableAt` (oportunidad Free demorada).
 * - Topes por persona y global en 24 h; lo que excede queda solo en la app.
 * - Reclamo atómico (`FOR UPDATE SKIP LOCKED`): dos instancias no mandan lo mismo.
 */
@Injectable()
export class EmailNotificationDispatcher {
  private readonly logger = new Logger('EmailNotifications');

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  async dispatch(): Promise<DispatchResult> {
    const result: DispatchResult = { sent: 0, skipped: 0, failed: 0, deferred: 0 };

    // Reclamos que quedaron colgados (el proceso murió a mitad de camino).
    await this.dataSource.query(
      `UPDATE notifications SET email_status = 'FAILED'
        WHERE email_status = 'SENDING' AND emailed_at < now() - interval '10 minutes'
          AND email_attempts >= $1`,
      [MAX_ATTEMPTS],
    );
    const claimed: Claimed[] = (
      await this.dataSource.query(
        `UPDATE notifications n
            SET email_status = 'SENDING', emailed_at = now(), email_attempts = n.email_attempts + 1
          WHERE n.id IN (
            SELECT id FROM notifications
             WHERE (email_status IS NULL
                    OR (email_status = 'SENDING' AND emailed_at < now() - interval '10 minutes'))
               AND (available_at IS NULL OR available_at <= now())
             ORDER BY created_at
             LIMIT $1
             FOR UPDATE SKIP LOCKED)
        RETURNING n.id, n.user_id, n.type, n.request_id, n.read_at, n.created_at, n.email_attempts`,
        [BATCH],
      )
    )[0] as Claimed[];
    if (claimed.length === 0) return result;

    const byUser = new Map<string, Claimed[]>();
    for (const n of claimed) byUser.set(n.user_id, [...(byUser.get(n.user_id) ?? []), n]);

    const users: { id: string; email: string; email_notifications: boolean }[] = await this.dataSource.query(
      `SELECT id, email, email_notifications FROM users WHERE id = ANY($1::uuid[])`,
      [[...byUser.keys()]],
    );
    const userById = new Map(users.map((u) => [u.id, u]));
    const staleBefore = Date.now() - STALE_HOURS * 3600_000;
    const dailyLimit = this.config.get<number>('EMAIL_NOTIFICATIONS_DAILY_LIMIT', 400);
    const perUserLimit = this.config.get<number>('EMAIL_NOTIFICATIONS_MAX_PER_USER_DAY', 12);
    let sentToday = await this.sentLast24h();

    for (const [userId, items] of byUser) {
      const user = userById.get(userId);
      const eligible: Claimed[] = [];
      const skip: string[] = [];
      for (const n of items) {
        const worth =
          !!EMAIL_NOTICE_COPY[n.type as keyof typeof EMAIL_NOTICE_COPY] &&
          n.read_at === null &&
          new Date(n.created_at).getTime() >= staleBefore &&
          !!user?.email_notifications;
        if (worth) eligible.push(n);
        else skip.push(n.id);
      }
      if (skip.length) {
        await this.mark(skip, 'SKIPPED');
        result.skipped += skip.length;
      }
      if (eligible.length === 0 || !user) continue;

      const ids = eligible.map((n) => n.id);
      const sentByUser = await this.sentLast24h(userId);
      if (sentByUser + eligible.length > perUserLimit) {
        await this.mark(ids, 'SKIPPED');
        result.skipped += ids.length;
        continue;
      }
      if (sentToday + eligible.length > dailyLimit) {
        await this.release(ids);
        result.deferred += ids.length;
        continue;
      }

      try {
        await this.email.sendActivityNotice({
          to: user.email,
          items: eligible.map((n) => ({
            text: EMAIL_NOTICE_COPY[n.type as keyof typeof EMAIL_NOTICE_COPY]!.text,
            url: this.appUrl(EMAIL_NOTICE_COPY[n.type as keyof typeof EMAIL_NOTICE_COPY]!.route(n.request_id)),
          })),
          unsubscribeUrl: this.unsubscribeUrl(userId),
        });
        await this.mark(ids, 'SENT');
        sentToday += ids.length;
        result.sent += ids.length;
      } catch (error) {
        // Sin el email ni el contenido en el log: solo la causa.
        this.logger.warn(`no se pudo enviar el aviso: ${(error as Error).message}`);
        const retry = eligible.filter((n) => n.email_attempts < MAX_ATTEMPTS).map((n) => n.id);
        const dead = eligible.filter((n) => n.email_attempts >= MAX_ATTEMPTS).map((n) => n.id);
        if (retry.length) await this.release(retry, false);
        if (dead.length) await this.mark(dead, 'FAILED');
        result.failed += ids.length;
      }
    }
    return result;
  }

  private appUrl(path: string): string {
    return `${this.config.get<string>('FRONTEND_URL', 'http://localhost:4200').replace(/\/+$/, '')}${path}`;
  }

  private unsubscribeUrl(userId: string): string {
    const token = createUnsubscribeToken(this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), userId);
    return this.appUrl(`/avisos/baja?t=${encodeURIComponent(token)}`);
  }

  private async sentLast24h(userId?: string): Promise<number> {
    const rows: { n: string }[] = await this.dataSource.query(
      `SELECT count(*) AS n FROM notifications
        WHERE email_status = 'SENT' AND emailed_at > now() - interval '24 hours'
          ${userId ? 'AND user_id = $1' : ''}`,
      userId ? [userId] : [],
    );
    return Number(rows[0].n);
  }

  private mark(ids: string[], status: 'SENT' | 'SKIPPED' | 'FAILED'): Promise<unknown> {
    return this.dataSource.query(
      `UPDATE notifications SET email_status = $2, emailed_at = now() WHERE id = ANY($1::uuid[])`,
      [ids, status],
    );
  }

  /** Vuelve a pendiente. `refund`: no cuenta como intento (se difirió, no se intentó). */
  private release(ids: string[], refund = true): Promise<unknown> {
    return this.dataSource.query(
      `UPDATE notifications
          SET email_status = NULL, emailed_at = NULL,
              email_attempts = CASE WHEN $2 THEN GREATEST(email_attempts - 1, 0) ELSE email_attempts END
        WHERE id = ANY($1::uuid[])`,
      [ids, refund],
    );
  }
}
