import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PushNotificationDispatcher } from './push-notification.dispatcher';
import { PUSH_SENDER, PushSender } from './push-sender';

/** Espera tras una acción antes de mandar: junta las novedades de un mismo clic. */
const KICK_DELAY_MS = 1500;
/** Respaldo por si un envío inmediato falló o salió del silencio nocturno. */
const INTERVAL_MS = 60_000;

/**
 * Cuándo se mandan los push. Principal: apenas termina una request que
 * escribe (`kick`, desde `PushKickInterceptor`): en Render Free el servidor
 * duerme sin tráfico, así que un job solo no alcanza, pero cada notificación
 * nace de una request y ahí el servidor está despierto. Respaldo: cada 60 s
 * mientras esté despierto. Apagado en tests, sin el flag o sin claves. Un ciclo a la vez.
 */
@Injectable()
export class PushNotificationScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('PushNotifications');
  private timer: NodeJS.Timeout | null = null;
  private kickTimer: NodeJS.Timeout | null = null;
  private running = false;
  private again = false;
  private active = false;

  constructor(
    private readonly config: ConfigService,
    private readonly dispatcher: PushNotificationDispatcher,
    @Inject(PUSH_SENDER) private readonly sender: PushSender,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get('NODE_ENV') === 'test' || !this.config.get<boolean>('PUSH_NOTIFICATIONS_ENABLED', false)) return;
    if (!this.sender.configured) {
      this.logger.warn('PUSH_NOTIFICATIONS_ENABLED sin VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT: los push quedan apagados');
      return;
    }
    this.active = true;
    this.timer = setInterval(() => void this.tick(), INTERVAL_MS);
    this.timer.unref();
    this.logger.log('avisos push activos');
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.kickTimer) clearTimeout(this.kickTimer);
  }

  /** Una acción pudo crear notificaciones: ciclo en un ratito (varios kicks seguidos = uno). */
  kick(): void {
    if (!this.active || this.kickTimer) return;
    this.kickTimer = setTimeout(() => {
      this.kickTimer = null;
      void this.tick();
    }, KICK_DELAY_MS);
    this.kickTimer.unref();
  }

  async tick(): Promise<void> {
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    try {
      const r = await this.dispatcher.dispatch();
      if (r.sent || r.failed) this.logger.log(`push enviados ${r.sent}, omitidos ${r.skipped}, con error ${r.failed}`);
    } catch (error) {
      this.logger.warn(`ciclo de push falló: ${(error as Error).message}`);
    } finally {
      this.running = false;
      if (this.again) {
        this.again = false;
        void this.tick();
      }
    }
  }
}
