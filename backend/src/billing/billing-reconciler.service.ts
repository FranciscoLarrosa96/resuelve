import { FunnelEventType } from '../funnel/funnel-event.entity';
import { recordFunnelEvent } from '../funnel/funnel';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, In } from 'typeorm';
import { ProOfferEvent, ProOfferEventType } from '../plans/pro-offer-event.entity';
import { ProOfferRedemption } from '../plans/pro-offer-redemption.entity';
import { offerEventDedupeKey } from '../plans/pro-offers';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { BillingPaymentStatus, BillingSubscriptionStatus, OPEN_SUBSCRIPTION_STATUSES } from './billing.enums';
import { BillingPayment } from './billing-payment.entity';
import {
  BILLING_PROVIDER,
  BillingProvider,
  ProviderAuthorizedPayment,
  ProviderSubscription,
} from './billing-provider';
import {
  billingGraceDays,
  billingProUntil,
  paidThrough,
  paymentStatusFromProvider,
  subscriptionStatusFromProvider,
} from './billing-rules';
import { BillingSubscription } from './billing-subscription.entity';

export type ReconcileResult = 'RECONCILED' | 'STALE' | 'UNKNOWN';

interface Followups {
  /** Primer ciclo promocional cobrado: pasar a precio normal. */
  regularPrice: string | null;
  /** El proveedor autorizó una suscripción que acá ya estaba cerrada: se cancela allá. */
  orphan: string | null;
  /** Cobro aprobado en una suscripción ya revocada (arrepentimiento): se reembolsa. */
  refund: string | null;
}

/**
 * Reconciliación con el proveedor. Webhook = aviso; la verdad sale SIEMPRE
 * de una lectura fresca del proveedor (nunca del body):
 *
 *   aviso / job / status → GET proveedor → lock perfil + suscripción → aplicar → derivar PRO
 *
 * - Idempotente: aplicar dos veces el mismo estado no cambia nada.
 * - Fuera de orden: una lectura con `last_modified` anterior a la ya
 *   aplicada se descarta (nunca degrada).
 * - Orden de locks: perfil → suscripción (igual que el checkout).
 * - Efectos en el proveedor (precio normal, cancelar huérfanas) se hacen
 *   después, con su propio lock y reintentables.
 */
@Injectable()
export class BillingReconciler {
  private readonly logger = new Logger('Billing');

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider,
  ) {}

  /** Aviso `subscription_preapproval` (o reconciliación): id del preapproval. */
  async reconcileSubscription(providerSubscriptionId: string): Promise<ReconcileResult> {
    const remote = await this.provider.getSubscription(providerSubscriptionId);
    if (!remote) return 'UNKNOWN';
    const followups: Followups = { regularPrice: null, orphan: null, refund: null };
    const result = await this.withLockedSubscription(
      { providerSubscriptionId: remote.id, externalReference: remote.externalReference },
      (m, sub) => this.applySubscription(m, sub, remote, followups),
    );
    await this.runFollowups(followups);
    return result;
  }

  /** Aviso `subscription_authorized_payment`: id del cobro (invoice). */
  async reconcilePayment(authorizedPaymentId: string): Promise<ReconcileResult> {
    const payment = await this.provider.getAuthorizedPayment(authorizedPaymentId);
    if (!payment) return 'UNKNOWN';
    return this.applyRemotePayment(payment);
  }

  /** Por id interno (CLI, status, job): suscripción + cobros conocidos por el proveedor. */
  async reconcileById(id: string): Promise<ReconcileResult> {
    const sub = await this.dataSource.getRepository(BillingSubscription).findOneBy({ id });
    if (!sub) return 'UNKNOWN';
    let providerId = sub.providerSubscriptionId;
    if (!providerId) {
      // Creación que terminó en timeout: ¿el proveedor la tiene igual?
      const found = await this.provider.findSubscriptionByExternalReference(sub.id);
      if (!found) return 'UNKNOWN';
      providerId = found.id;
    }
    const result = await this.reconcileSubscription(providerId);
    // Estado DESPUÉS de reconciliar: la que recién se autorizó ya tiene su primer cobro en el proveedor.
    const current = await this.dataSource.getRepository(BillingSubscription).findOneBy({ id: sub.id });
    if (current && current.status !== BillingSubscriptionStatus.PENDING) {
      for (const p of await this.provider.listAuthorizedPayments(providerId)) await this.applyRemotePayment(p);
    }
    await this.applyRegularPrice(sub.id);
    await this.refundWithdrawn(sub.id);
    return result;
  }

  /**
   * Job periódico / `billing:reconcile -- reconcile-all`: todo lo no
   * terminal, los PENDING recientes y los cambios de precio pendientes.
   */
  async reconcileAll(): Promise<{ checked: number; failed: number }> {
    const rows = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM billing_subscriptions
        WHERE status IN ('ACTIVE', 'PAST_DUE', 'PAUSED')
           OR (status = 'PENDING' AND created_at > now() - interval '7 days')
           OR (offer_redeemed_at IS NOT NULL AND offer_regular_price_applied_at IS NULL AND status <> 'CANCELLED')
           OR (withdrawn_at IS NOT NULL AND EXISTS (
                 SELECT 1 FROM billing_payments p
                  WHERE p.billing_subscription_id = billing_subscriptions.id AND p.status = 'APPROVED'))
        ORDER BY updated_at ASC LIMIT 500`,
    );
    let failed = 0;
    for (const { id } of rows) {
      try {
        await this.reconcileById(id);
      } catch (error) {
        failed++;
        this.logger.warn(`billing reconcile ${id} falló: ${(error as Error).message}`);
      }
    }
    return { checked: rows.length, failed };
  }

  /**
   * Después del ciclo promocional cobrado: PUT del monto normal en el
   * proveedor. Con lock (dos avisos simultáneos → un PUT) y SIN marcar nada
   * si el proveedor no lo confirma: queda pendiente para el job/CLI.
   */
  async applyRegularPrice(subscriptionId: string): Promise<'APPLIED' | 'SKIPPED' | 'FAILED'> {
    return this.dataSource.transaction(async (m) => {
      const sub = await m.findOne(BillingSubscription, {
        where: { id: subscriptionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !sub?.providerSubscriptionId ||
        !sub.offerCode ||
        !sub.offerRedeemedAt ||
        sub.offerRegularPriceAppliedAt ||
        sub.status === BillingSubscriptionStatus.CANCELLED
      ) {
        return 'SKIPPED';
      }
      const approved = await m.count(BillingPayment, {
        where: { billingSubscriptionId: sub.id, status: BillingPaymentStatus.APPROVED },
      });
      if (approved < (sub.offerCycles ?? 1)) return 'SKIPPED';
      try {
        let remote = await this.provider.updateSubscriptionAmount(
          sub.providerSubscriptionId,
          sub.baseAmount,
          sub.currency,
        );
        if (remote.amount !== sub.baseAmount) {
          remote = (await this.provider.getSubscription(sub.providerSubscriptionId)) ?? remote;
        }
        if (remote.amount !== sub.baseAmount) throw new Error(`monto informado ${remote.amount}`);
      } catch (error) {
        this.logger.warn(`billing regular price pendiente ${sub.id}: ${(error as Error).message}`);
        return 'FAILED';
      }
      await m.update(BillingSubscription, sub.id, {
        offerRegularPriceAppliedAt: new Date(),
        currentAmount: sub.baseAmount,
      });
      this.logger.log(`billing regular price applied ${sub.id}`);
      return 'APPLIED';
    });
  }

  /**
   * Arrepentimiento: devuelve cada cobro APROBADO de una suscripción revocada.
   * Un cobro a la vez, con el pago bloqueado; solo marca REFUNDED si el
   * proveedor lo confirma. Si falla queda pendiente (APPROVED sin `refunded_at`)
   * y lo reintentan el job, `billing:reconcile` o el propio botón.
   * Devuelve cuántos reembolsos quedan pendientes.
   */
  async refundWithdrawn(subscriptionId: string): Promise<number> {
    const sub = await this.dataSource.getRepository(BillingSubscription).findOneBy({ id: subscriptionId });
    if (!sub?.withdrawnAt) return 0;
    const pending = await this.dataSource.getRepository(BillingPayment).find({
      where: { billingSubscriptionId: sub.id, status: BillingPaymentStatus.APPROVED },
      order: { createdAt: 'ASC' },
    });
    let left = 0;
    for (const p of pending) {
      if (!p.providerPaymentId) {
        // Sin id de pago no hay a qué devolver todavía: la reconciliación lo completa.
        left++;
        continue;
      }
      try {
        const refund = await this.provider.refundPayment(p.providerPaymentId);
        await this.dataSource.getRepository(BillingPayment).update(
          { id: p.id, status: BillingPaymentStatus.APPROVED },
          {
            status: BillingPaymentStatus.REFUNDED,
            refundedAt: new Date(),
            providerRefundId: refund.id.slice(0, 64),
            providerUpdatedAt: new Date(),
          },
        );
        this.logger.log(`billing payment refunded ${sub.id}`);
      } catch (error) {
        left++;
        this.logger.warn(`billing reembolso pendiente ${sub.id}: ${(error as Error).message}`);
      }
    }
    return left;
  }

  /** Recalcula `billing_pro_until` del perfil (dentro de la transacción de quien cambió algo). */
  async syncProfileAccess(m: EntityManager, professionalId: string, now = new Date()): Promise<void> {
    const subs = await m.find(BillingSubscription, { where: { professionalId } });
    await m.update(ProfessionalProfile, professionalId, {
      billingProUntil: billingProUntil(subs, billingGraceDays(this.config), now),
    });
  }

  // ---------------------------------------------------------------------------

  private async applyRemotePayment(payment: ProviderAuthorizedPayment): Promise<ReconcileResult> {
    // Lectura fresca del preapproval para el próximo cobro; si falla, igual se aplica el cobro.
    const remoteSub = await this.provider.getSubscription(payment.subscriptionId).catch(() => null);
    const followups: Followups = { regularPrice: null, orphan: null, refund: null };
    const result = await this.withLockedSubscription(
      { providerSubscriptionId: payment.subscriptionId, externalReference: remoteSub?.externalReference ?? null },
      async (m, sub) => {
        if (remoteSub) await this.applySubscription(m, sub, remoteSub, followups);
        return this.applyPayment(m, sub, payment, followups);
      },
    );
    await this.runFollowups(followups);
    return result;
  }

  /** Busca la suscripción local y la bloquea (perfil primero) antes de `fn`. */
  private async withLockedSubscription(
    key: { providerSubscriptionId: string; externalReference: string | null },
    fn: (m: EntityManager, sub: BillingSubscription) => Promise<ReconcileResult>,
  ): Promise<ReconcileResult> {
    const repo = this.dataSource.getRepository(BillingSubscription);
    const found =
      (await repo.findOneBy({ providerSubscriptionId: key.providerSubscriptionId })) ??
      (key.externalReference && isUuid(key.externalReference)
        ? await repo.findOneBy({ id: key.externalReference })
        : null);
    if (!found || (found.providerSubscriptionId && found.providerSubscriptionId !== key.providerSubscriptionId)) {
      this.logger.warn('billing aviso de una suscripción desconocida (ignorado)');
      return 'UNKNOWN';
    }
    return this.dataSource.transaction(async (m) => {
      await m.findOne(ProfessionalProfile, {
        where: { id: found.professionalId },
        lock: { mode: 'pessimistic_write' },
      });
      const sub = await m.findOneOrFail(BillingSubscription, {
        where: { id: found.id },
        lock: { mode: 'pessimistic_write' },
      });
      const result = await fn(m, sub);
      await this.syncProfileAccess(m, sub.professionalId);
      return result;
    });
  }

  private async applySubscription(
    m: EntityManager,
    sub: BillingSubscription,
    remote: ProviderSubscription,
    followups: Followups,
    now = new Date(),
  ): Promise<ReconcileResult> {
    if (sub.providerUpdatedAt && remote.lastModified && remote.lastModified < sub.providerUpdatedAt) {
      await m.update(BillingSubscription, sub.id, { lastProviderSyncAt: now });
      return 'STALE';
    }
    const prev = sub.status;
    let next = subscriptionStatusFromProvider(remote.status, prev);
    if (prev === BillingSubscriptionStatus.CANCELLED) {
      // Cerrada acá (reemplazada o cancelada): terminal. Si el proveedor la autorizó igual, se cancela allá.
      if (next !== BillingSubscriptionStatus.CANCELLED) followups.orphan = remote.id;
      next = BillingSubscriptionStatus.CANCELLED;
    }
    const patch: Partial<BillingSubscription> = {
      status: next,
      providerSubscriptionId: sub.providerSubscriptionId ?? remote.id,
      providerStatus: remote.status.slice(0, 32),
      checkoutUrl: remote.checkoutUrl ?? sub.checkoutUrl,
      currentAmount: remote.amount && remote.amount > 0 ? Math.round(remote.amount) : sub.currentAmount,
      nextPaymentAt: remote.nextPaymentDate ?? sub.nextPaymentAt,
      providerUpdatedAt: remote.lastModified ?? sub.providerUpdatedAt,
      lastProviderSyncAt: now,
    };
    if (next === BillingSubscriptionStatus.ACTIVE && !sub.authorizedAt) patch.authorizedAt = now;
    if (next === BillingSubscriptionStatus.CANCELLED && prev !== BillingSubscriptionStatus.CANCELLED) {
      // Cancelada desde Mercado Pago: conserva lo ya pagado (mismo criterio que cancelar desde Resuelve).
      patch.cancelledAt = now;
      const paid = paidThrough(sub, null);
      patch.accessUntil = sub.accessUntil ?? (paid && paid > now ? paid : null);
      patch.nextPaymentAt = sub.nextPaymentAt;
      await recordFunnelEvent(m, { type: FunnelEventType.PRO_CANCELLED, professionalId: sub.professionalId, ref: sub.id });
    }
    Object.assign(sub, patch);
    await m.save(sub);
    if (prev !== next) this.logger.log(`billing subscription reconciled ${sub.id} ${prev} → ${next}`);
    if (this.needsRegularPrice(sub)) followups.regularPrice = sub.id;
    return 'RECONCILED';
  }

  private async applyPayment(
    m: EntityManager,
    sub: BillingSubscription,
    remote: ProviderAuthorizedPayment,
    followups: Followups,
    now = new Date(),
  ): Promise<ReconcileResult> {
    const existing = await m.findOne(BillingPayment, { where: { providerAuthorizedPaymentId: remote.id } });
    if (existing?.providerUpdatedAt && remote.lastModified && remote.lastModified < existing.providerUpdatedAt) {
      return 'STALE';
    }
    // Ya reembolsado acá: una lectura que todavía lo ve aprobado no lo "vuelve a cobrar".
    if (existing?.status === BillingPaymentStatus.REFUNDED && paymentStatusFromProvider(remote) === BillingPaymentStatus.APPROVED) {
      return 'STALE';
    }
    const status = paymentStatusFromProvider(remote);
    await m.upsert(
      BillingPayment,
      {
        billingSubscriptionId: sub.id,
        providerAuthorizedPaymentId: remote.id,
        providerPaymentId: remote.paymentId,
        amount: Math.round(remote.amount),
        currency: remote.currency.slice(0, 3),
        status,
        statusDetail: remote.paymentStatusDetail?.slice(0, 80) ?? null,
        retryAttempt: remote.retryAttempt,
        debitDate: remote.debitDate,
        providerUpdatedAt: remote.lastModified,
      },
      { conflictPaths: ['providerAuthorizedPaymentId'] },
    );
    const at = remote.debitDate && remote.debitDate < now ? remote.debitDate : now;

    if (status === BillingPaymentStatus.APPROVED) {
      const patch: Partial<BillingSubscription> = {
        lastPaymentAt: sub.lastPaymentAt && sub.lastPaymentAt > at ? sub.lastPaymentAt : at,
      };
      // Solo un cobro posterior al rechazo saca de la mora (releer uno viejo no la borra).
      if (!sub.pastDueSince || at >= sub.pastDueSince) {
        patch.pastDueSince = null;
        if (sub.status === BillingSubscriptionStatus.PAST_DUE) patch.status = BillingSubscriptionStatus.ACTIVE;
      }
      if (sub.offerCode && !sub.offerRedeemedAt && remote.amount < sub.baseAmount) {
        await this.redeemOffer(m, sub, Math.round(remote.amount), now);
        patch.offerRedeemedAt = now;
      }
      if (sub.withdrawnAt) {
        // Revocó la contratación: este cobro no da acceso, se devuelve.
        followups.refund = sub.id;
      } else if (sub.status === BillingSubscriptionStatus.CANCELLED && sub.cancelledAt && at <= sub.cancelledAt) {
        // Cobro de antes de cancelar que llegó tarde: lo pagado se conserva hasta el fin de ese ciclo.
        const paid = paidThrough({ ...sub, lastPaymentAt: patch.lastPaymentAt! }, null);
        if (paid && paid > now && (!sub.accessUntil || paid > sub.accessUntil)) patch.accessUntil = paid;
      }
      Object.assign(sub, patch);
      await m.save(sub);
      // Ya pagó PRO: no vuelve a tener oferta de bienvenida.
      await m.query(
        `UPDATE professional_profiles SET first_paid_pro_at = coalesce(first_paid_pro_at, $2) WHERE id = $1`,
        [sub.professionalId, now],
      );
      if (existing?.status !== BillingPaymentStatus.APPROVED) {
        this.logger.log(`billing payment reconciled ${sub.id} approved`);
        // Embudo: cada cobro aprobado una vez; desde el segundo (de cualquier suscripción) es renovación.
        await recordFunnelEvent(m, {
          type: FunnelEventType.PRO_PAYMENT_APPROVED,
          professionalId: sub.professionalId,
          ref: remote.id,
          at,
        });
        const [{ previous }] = await m.query<{ previous: number }[]>(
          `SELECT count(*)::int AS previous FROM billing_payments bp
             JOIN billing_subscriptions bs ON bs.id = bp.billing_subscription_id
            WHERE bs.professional_id = $1 AND bp.status = 'APPROVED' AND bp.provider_authorized_payment_id <> $2`,
          [sub.professionalId, remote.id],
        );
        if (previous > 0) {
          await recordFunnelEvent(m, {
            type: FunnelEventType.PRO_RENEWED,
            professionalId: sub.professionalId,
            ref: remote.id,
            at,
          });
        }
      }
    } else if (status === BillingPaymentStatus.REJECTED || status === BillingPaymentStatus.CANCELLED) {
      // Un rechazo de un ciclo ya cubierto por un pago posterior no cuenta.
      const superseded = sub.lastPaymentAt && remote.debitDate && remote.debitDate <= sub.lastPaymentAt;
      const alreadyPaid = existing?.status === BillingPaymentStatus.APPROVED;
      if (!superseded && !alreadyPaid && sub.status === BillingSubscriptionStatus.ACTIVE) {
        sub.status = BillingSubscriptionStatus.PAST_DUE;
        sub.pastDueSince = sub.pastDueSince ?? at;
        await m.save(sub);
        this.logger.log(`billing payment reconciled ${sub.id} rejected → PAST_DUE`);
      }
    }
    if (this.needsRegularPrice(sub)) followups.regularPrice = sub.id;
    return 'RECONCILED';
  }

  /**
   * La oferta queda consumida con el primer cobro promocional aprobado (no
   * al crear el checkout: abandonar no la gasta). Unique profesional +
   * código: un aviso repetido no la usa dos veces.
   */
  private async redeemOffer(m: EntityManager, sub: BillingSubscription, paid: number, now: Date): Promise<void> {
    const discountPercent = Math.round((1 - paid / sub.baseAmount) * 100);
    await m
      .createQueryBuilder()
      .insert()
      .into(ProOfferRedemption)
      .values({
        professionalId: sub.professionalId,
        offerCode: sub.offerCode!,
        discountPercent: Math.max(0, Math.min(100, discountPercent)),
        cycles: sub.offerCycles ?? 1,
        basePriceArs: sub.baseAmount,
        discountedPriceArs: paid,
      })
      .orIgnore()
      .execute();
    await m
      .createQueryBuilder()
      .insert()
      .into(ProOfferEvent)
      .values({
        type: ProOfferEventType.REDEEMED,
        surface: null,
        professionalId: sub.professionalId,
        offerCode: sub.offerCode!,
        dedupeKey: offerEventDedupeKey(ProOfferEventType.REDEEMED, sub.professionalId, sub.offerCode!, null, now),
      })
      .orIgnore()
      .execute();
    this.logger.log(`billing offer redeemed ${sub.id} ${sub.offerCode}`);
  }

  private needsRegularPrice(sub: BillingSubscription): boolean {
    return (
      !!sub.offerCode &&
      !!sub.offerRedeemedAt &&
      !sub.offerRegularPriceAppliedAt &&
      sub.status !== BillingSubscriptionStatus.CANCELLED
    );
  }

  private async runFollowups(f: Followups): Promise<void> {
    if (f.regularPrice) await this.applyRegularPrice(f.regularPrice);
    if (f.refund) await this.refundWithdrawn(f.refund).catch(() => 0);
    if (f.orphan) {
      this.logger.warn('billing suscripción autorizada que ya estaba cerrada: se cancela en el proveedor');
      await this.provider.cancelSubscription(f.orphan).catch((error: Error) => {
        this.logger.warn(`billing no se pudo cancelar la huérfana: ${error.message}`);
      });
    }
  }
}

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Estados abiertos como lista para queries (`In(...)`). */
export const openStatuses = () => In([...OPEN_SUBSCRIPTION_STATUSES]);
