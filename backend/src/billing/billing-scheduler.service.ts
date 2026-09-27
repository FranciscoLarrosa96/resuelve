import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BILLING_PROVIDER, BillingProvider } from './billing-provider';
import { BillingReconciler } from './billing-reconciler.service';

/**
 * Reconciliación periódica (default cada 60 min): no depender 100 % del
 * webhook. PENDING recientes, ACTIVE/PAST_DUE/PAUSED y cambios de precio
 * pendientes. Un solo ciclo a la vez; apagado en tests y con
 * `BILLING_RECONCILE_INTERVAL_MINUTES=0`.
 */
@Injectable()
export class BillingScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Billing');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly reconciler: BillingReconciler,
    @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider,
  ) {}

  onApplicationBootstrap(): void {
    const minutes = this.config.get<number>('BILLING_RECONCILE_INTERVAL_MINUTES', 60);
    if (!this.provider.configured || minutes <= 0 || this.config.get('NODE_ENV') === 'test') return;
    this.timer = setInterval(() => void this.tick(), minutes * 60_000);
    this.timer.unref();
    this.logger.log(`billing reconcile cada ${minutes} min (MP_ENV=${this.config.get('MP_ENV', 'test')})`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const { checked, failed } = await this.reconciler.reconcileAll();
      if (checked) this.logger.log(`billing reconcile-all: ${checked} revisadas, ${failed} con error`);
    } catch (error) {
      this.logger.warn(`billing reconcile-all falló: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
