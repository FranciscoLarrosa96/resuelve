import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailNotificationDispatcher } from './email-notification.dispatcher';

/**
 * Revisa avisos pendientes cada `EMAIL_NOTIFICATIONS_INTERVAL_SECONDS`. Apagado
 * en tests, sin `EMAIL_NOTIFICATIONS_ENABLED` y sin `SMTP_HOST`. Un ciclo a la vez.
 */
@Injectable()
export class EmailNotificationScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('EmailNotifications');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly dispatcher: EmailNotificationDispatcher,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get('NODE_ENV') === 'test' || !this.config.get<boolean>('EMAIL_NOTIFICATIONS_ENABLED', false)) {
      return;
    }
    if (!this.config.get<string>('SMTP_HOST')) {
      this.logger.warn('EMAIL_NOTIFICATIONS_ENABLED sin SMTP_HOST: los avisos por email quedan apagados');
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
