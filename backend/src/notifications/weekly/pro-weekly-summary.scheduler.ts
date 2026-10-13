import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { sendProWeeklySummaries } from './pro-weekly-summary';

const INTERVAL_MS = 60 * 60_000;

/**
 * Cada hora revisa si ya corresponde el resumen semanal de PRO (desde el lunes a las 9,
 * hora de Argentina); la clave única hace que salga una vez por persona y semana.
 * Apagado en tests (se llama `tick()` directo) y con `PRO_WEEKLY_SUMMARY_ENABLED=false`.
 */
@Injectable()
export class ProWeeklySummaryScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('ProWeeklySummary');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get('NODE_ENV') === 'test' || !this.config.get<boolean>('PRO_WEEKLY_SUMMARY_ENABLED', true)) return;
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
      const created = await sendProWeeklySummaries(this.dataSource, now);
      if (created) this.logger.log(`resumen semanal: ${created} avisos`);
      return created;
    } catch (error) {
      this.logger.warn(`resumen semanal falló: ${(error as Error).message}`);
      return 0;
    } finally {
      this.running = false;
    }
  }
}
