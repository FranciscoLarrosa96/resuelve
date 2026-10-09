import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TransferService } from './transfer.service';

/**
 * Cada hora: aviso "Tu PRO vence pronto" y borrado de comprobantes viejos.
 * Nada vence por acá: el PRO por transferencia se deriva de la fecha al leer.
 * Apagado en tests (se llama `tick()` directo) y con `TRANSFER_JOB_INTERVAL_MINUTES=0`.
 */
@Injectable()
export class TransferScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Transfer');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly transfers: TransferService,
  ) {}

  onApplicationBootstrap(): void {
    const minutes = this.config.get<number>('TRANSFER_JOB_INTERVAL_MINUTES', 60);
    if (minutes <= 0 || this.config.get('NODE_ENV') === 'test') return;
    this.timer = setInterval(() => void this.tick(), minutes * 60_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const { reminded, purged } = await this.transfers.tick();
      if (reminded || purged) this.logger.log(`transfer job: ${reminded} avisos de vencimiento, ${purged} comprobantes borrados`);
    } catch (error) {
      this.logger.warn(`transfer job falló: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
