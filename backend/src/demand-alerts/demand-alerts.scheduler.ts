import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { sendDemandAlerts } from './demand-alerts';

const INTERVAL_MS = 15 * 60_000;

/**
 * Cada 15 minutos avisa a quienes esperaban un servicio en su localidad y ya tienen
 * profesionales. Apagado en tests (se llama `tick()` directo).
 */
@Injectable()
export class DemandAlertsScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('DemandAlerts');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get('NODE_ENV') === 'test') return;
    this.timer = setInterval(() => void this.tick(), INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const sent = await sendDemandAlerts(this.dataSource, now);
      if (sent) this.logger.log(`avisos de oferta nueva: ${sent}`);
      return sent;
    } catch (error) {
      this.logger.warn(`avisos de oferta nueva fallaron: ${(error as Error).message}`);
      return 0;
    } finally {
      this.running = false;
    }
  }
}
