import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AppException } from '../../common/errors/app-exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { isAllowedPushEndpoint } from './push-endpoint';
import { PUSH_SENDER, PushSender } from './push-sender';

/** Más de esto por persona no tiene sentido (celular, compu, tablet…): se descartan los más viejos. */
export const MAX_SUBSCRIPTIONS_PER_USER = 10;

/**
 * Dispositivos de cada persona para los avisos push. Una suscripción es de un
 * navegador: si en ese navegador entra otra cuenta, pasa a esa cuenta (el
 * endpoint es único), así nunca le llegan a alguien avisos de otra.
 */
@Injectable()
export class PushSubscriptionsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    @Inject(PUSH_SENDER) private readonly sender: PushSender,
  ) {}

  /** Lo que necesita el navegador para suscribirse. `enabled: false` = no se ofrece. */
  publicConfig(): { enabled: boolean; publicKey: string | null } {
    const enabled = this.enabled();
    return { enabled, publicKey: enabled ? this.sender.publicKey : null };
  }

  enabled(): boolean {
    return this.config.get<boolean>('PUSH_NOTIFICATIONS_ENABLED', false) && this.sender.configured;
  }

  async subscribe(userId: string, sub: { endpoint: string; p256dh: string; auth: string }): Promise<void> {
    if (!this.enabled()) {
      throw AppException.conflict(ErrorCode.PUSH_DISABLED, 'Los avisos push no están disponibles por ahora.');
    }
    if (!isAllowedPushEndpoint(sub.endpoint)) {
      throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, 'Ese dispositivo no se puede suscribir.');
    }
    await this.dataSource.transaction(async (m) => {
      await m.query(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (endpoint) DO UPDATE
           SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
               failures = 0, updated_at = now()`,
        [userId, sub.endpoint, sub.p256dh, sub.auth],
      );
      await m.query(
        `DELETE FROM push_subscriptions WHERE id IN (
           SELECT id FROM push_subscriptions WHERE user_id = $1 ORDER BY updated_at DESC OFFSET $2)`,
        [userId, MAX_SUBSCRIPTIONS_PER_USER],
      );
    });
  }

  /** Solo la propia: con el endpoint de otra cuenta no pasa nada. Idempotente. */
  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.dataSource.query(`DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`, [
      userId,
      endpoint,
    ]);
  }

  /** ¿Este navegador sigue suscripto a esta cuenta? (el navegador puede tener una suscripción vieja). */
  async has(userId: string, endpoint: string): Promise<boolean> {
    const rows = await this.dataSource.query(`SELECT 1 FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`, [
      userId,
      endpoint,
    ]);
    return rows.length > 0;
  }
}
