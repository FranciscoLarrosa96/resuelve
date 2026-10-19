import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailNotificationDispatcher } from './email-notification.dispatcher';
import { EmailPreferenceService } from './email-preference.service';

/**
 * Revisa avisos pendientes cada `EMAIL_NOTIFICATIONS_INTERVAL_SECONDS`. Apagado
 * en tests o sin envío configurado (flag y Resend/SMTP). Un ciclo a la vez.
 */
@Injectable()
export class EmailNotificationScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('EmailNotifications');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly dispatcher: EmailNotificationDispatcher,
    private readonly preference: EmailPreferenceService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get('NODE_ENV') === 'test' || !this.config.get<boolean>('EMAIL_NOTIFICATIONS_ENABLED', false)) {
      return;
    }
    if (!this.preference.deliveryConfig().deliveryEnabled) {
      this.logger.warn('EMAIL_NOTIFICATIONS_ENABLED sin RESEND_API_KEY ni SMTP_HOST: los avisos por email quedan apagados');
      return;
    }
    const seconds = this.config.get<number>('EMAIL_NOTIFICATIONS_INTERVAL_SECONDS', 60);
    this.timer = setInterval(() => void this.tick(), seconds * 1000);
    this.timer.unref();
    this.logger.log(`avisos por email cada ${seconds} s`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const r = await this.dispatcher.dispatch();
      if (r.sent || r.failed || r.deferred) {
        this.logger.log(`enviados ${r.sent}, omitidos ${r.skipped}, con error ${r.failed}, diferidos ${r.deferred}`);
      }
    } catch (error) {
      this.logger.warn(`ciclo de avisos falló: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
