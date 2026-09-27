import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BillingProviderName } from './billing.enums';
import { BillingReconciler, ReconcileResult } from './billing-reconciler.service';
import { BillingWebhookEvent } from './billing-webhook-event.entity';

export const SUBSCRIPTION_TOPICS = ['subscription_preapproval', 'subscription_authorized_payment'] as const;

export interface WebhookNotice {
  topic: string;
  resourceId: string;
  requestId: string;
  signatureTimestamp: string | null;
}

/**
 * Aviso YA validado (firma) → reconciliación. El aviso solo dice QUÉ mirar;
 * el estado sale de una lectura fresca del proveedor. La misma entrega
 * (`x-request-id`) procesada con éxito no se repite; una que falló se
 * reintenta cuando Mercado Pago la reenvía.
 */
@Injectable()
export class BillingWebhookService {
  private readonly logger = new Logger('Billing');

  constructor(
    private readonly dataSource: DataSource,
    private readonly reconciler: BillingReconciler,
  ) {}

  async handle(notice: WebhookNotice): Promise<'PROCESSED' | 'IGNORED' | 'DUPLICATE'> {
    const repo = this.dataSource.getRepository(BillingWebhookEvent);
    const key = {
      provider: BillingProviderName.MERCADO_PAGO,
      topic: notice.topic.slice(0, 60),
      providerResourceId: notice.resourceId,
      requestId: notice.requestId.slice(0, 100),
    };
    const seen = await repo.findOneBy(key);
    if (seen && seen.result !== 'ERROR') return 'DUPLICATE';

    let result: 'PROCESSED' | 'IGNORED' | 'ERROR';
    let outcome: ReconcileResult | null = null;
    try {
      if (notice.topic === 'subscription_preapproval') {
        outcome = await this.reconciler.reconcileSubscription(notice.resourceId);
      } else if (notice.topic === 'subscription_authorized_payment') {
        outcome = await this.reconciler.reconcilePayment(notice.resourceId);
      }
      result = outcome === null || outcome === 'UNKNOWN' ? 'IGNORED' : 'PROCESSED';
    } catch (error) {
      result = 'ERROR';
      this.logger.warn(`mp webhook ${notice.topic} falló: ${(error as Error).message}`);
    }
    await repo.upsert(
      { ...key, signatureTimestamp: notice.signatureTimestamp, result, processedAt: new Date() },
      { conflictPaths: ['provider', 'topic', 'providerResourceId', 'requestId'] },
    );
    this.logger.log(`mp webhook ${notice.topic} ${notice.resourceId} → ${outcome ?? 'ignored'} (${result})`);
    if (result === 'ERROR') throw new Error('reconciliation failed');
    return result;
  }
}
