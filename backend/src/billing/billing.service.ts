import { FunnelEventType } from '../funnel/funnel-event.entity';
import { recordFunnelEvent } from '../funnel/funnel';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager, In, IsNull, Not } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { planSource, presentPlan } from '../plans/plan';
import { presentIntroOffer, proMonthlyPrice } from '../plans/pro-offers';
import { freeQuoteUsage } from '../plans/quote-quota';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { BillingProviderName, BillingSubscriptionStatus, OPEN_SUBSCRIPTION_STATUSES } from './billing.enums';
import {
  BILLING_PROVIDER,
  BillingProvider,
  BillingProviderError,
  ProviderSubscription,
} from './billing-provider';
import { BillingReconciler } from './billing-reconciler.service';
import { billingGraceDays, paidThrough, safeReturnPath } from './billing-rules';
import { BillingSubscription } from './billing-subscription.entity';

const DAY_MS = 86_400_000;
/** Un PENDING se relee del proveedor como mucho cada 10 s (la pantalla de resultado consulta seguido). */
const PENDING_SYNC_MS = 10_000;

export interface CheckoutPrice {
  amount: number;
  baseAmount: number;
  currency: string;
  offerCode: string | null;
  offerCycles: number | null;
  discountPercent: number | null;
}

/**
 * Suscripción PRO del propio profesional: checkout, estado y cancelación.
 * El monto y la oferta se deciden SIEMPRE acá; el frontend solo recibe la
 * URL de Mercado Pago (`init_point`) y el estado ya reconciliado.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger('Billing');

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly reconciler: BillingReconciler,
    @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider,
  ) {}

  get enabled(): boolean {
    return this.provider.configured;
  }

  /**
   * Crea (o reutiliza) el checkout. Con el perfil bloqueado: un doble click
   * espera al primero y recibe el MISMO checkout (además del índice único de
   * "una suscripción abierta por profesional"). No exige email verificado.
   */
  async checkout(
    profile: ProfessionalProfile,
    userId: string,
    returnTo?: string,
  ): Promise<{ checkoutUrl: string; subscriptionId: string }> {
    this.assertEnabled();
    const returnPath = safeReturnPath(returnTo);
    const pending = await this.openSubscription(this.dataSource.manager, profile.id);
    if (pending?.status === BillingSubscriptionStatus.PENDING && this.shouldSync(pending)) {
      // ¿Ya la autorizó en otra pestaña? Mejor saberlo antes de ofrecer otra.
      await this.reconciler.reconcileById(pending.id).catch(() => null);
    }
    const payerEmail = await this.payerEmail(userId);

    return this.dataSource.transaction(async (m) => {
      const p = await m.findOneOrFail(ProfessionalProfile, {
        where: { id: profile.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (planSource(p) === 'MANUAL') {
        throw AppException.conflict(
          ErrorCode.BILLING_MANUAL_PRO_ACTIVE,
          'Ya tenés Resuelve PRO activo. No hace falta suscribirte.',
        );
      }
      const open = await this.openSubscription(m, p.id, true);
      const price = await this.checkoutPrice(m, p);

      if (open) {
        if (
          open.status === BillingSubscriptionStatus.ACTIVE ||
          open.status === BillingSubscriptionStatus.PAST_DUE
        ) {
          throw AppException.conflict(
            ErrorCode.BILLING_ALREADY_SUBSCRIBED,
            'Ya tenés una suscripción a Resuelve PRO.',
          );
        }
        if (open.status === BillingSubscriptionStatus.PENDING && this.reusable(open, price)) {
          if (returnPath && returnPath !== open.returnPath)
            await m.update(BillingSubscription, open.id, { returnPath });
          return { checkoutUrl: open.checkoutUrl!, subscriptionId: open.id };
        }
        await this.closeBeforeReplacing(m, open);
      }

      const sub = m.create(BillingSubscription, {
        id: randomUUID(),
        professionalId: p.id,
        provider: BillingProviderName.MERCADO_PAGO,
        status: BillingSubscriptionStatus.PENDING,
        baseAmount: price.baseAmount,
        currentAmount: price.amount,
        currency: price.currency,
        offerCode: price.offerCode,
        offerCycles: price.offerCycles,
        returnPath,
      });
      await m.insert(BillingSubscription, sub);

      let remote: ProviderSubscription | null;
      try {
        remote = await this.provider.createSubscription({
          externalReference: sub.id,
          payerEmail,
          reason: 'Resuelve PRO',
          amount: price.amount,
          currency: price.currency,
          backUrl: this.config.get<string>('MP_BACK_URL') ?? `${this.frontendUrl()}/pro/plan/resultado`,
        });
      } catch (error) {
        // Timeout ambiguo: nunca se reintenta el POST a ciegas; se busca por external_reference.
        remote =
          error instanceof BillingProviderError && error.ambiguous
            ? await this.provider.findSubscriptionByExternalReference(sub.id).catch(() => null)
            : null;
        if (!remote) throw this.providerError(error);
      }
      if (!remote.checkoutUrl) throw this.providerError(new Error('sin init_point'));
      await m.update(BillingSubscription, sub.id, {
        providerSubscriptionId: remote.id,
        checkoutUrl: remote.checkoutUrl,
        providerStatus: remote.status.slice(0, 32),
        providerUpdatedAt: remote.lastModified,
        lastProviderSyncAt: new Date(),
      });
      await recordFunnelEvent(m, {
        type: FunnelEventType.PRO_CHECKOUT_STARTED,
        professionalId: p.id,
        ref: sub.id,
      });
      this.logger.log(
        `billing checkout created ${sub.id} amount=${price.amount}${price.offerCode ? ` offer=${price.offerCode}` : ''}`,
      );
      return { checkoutUrl: remote.checkoutUrl, subscriptionId: sub.id };
    });
  }

  /** Estado del plan y de la suscripción (con reconciliación de un PENDING reciente, con límite). */
  async status(profile: ProfessionalProfile) {
    const repo = this.dataSource.getRepository(BillingSubscription);
    let sub = await this.visibleSubscription(profile.id);
    if (sub?.status === BillingSubscriptionStatus.PENDING && this.enabled && this.shouldSync(sub)) {
      await this.reconciler.reconcileById(sub.id).catch((error: Error) => {
        this.logger.warn(`billing status reconcile falló: ${error.message}`);
      });
      sub = await this.visibleSubscription(profile.id);
    }
    const p = await this.dataSource.getRepository(ProfessionalProfile).findOneByOrFail({ id: profile.id });
    const plan = presentPlan(p);
    const openActive =
      sub?.status === BillingSubscriptionStatus.ACTIVE || sub?.status === BillingSubscriptionStatus.PAST_DUE;
    // Con PRO vigente (manual, o pago y cancelado con acceso hasta fin de período) no se ofrece otro cobro.
    const canCheckout = this.enabled && (plan.source === null || plan.source === 'BONUS') && !openActive;
    const hadSubscription = await repo.exists({
      where: { professionalId: p.id, authorizedAt: Not(IsNull()) },
    });
    return {
      /** false = no se contrata online (BILLING_PROVIDER=none). */
      enabled: this.enabled,
      plan: plan.tier,
      source: plan.source,
      entitlements: plan.entitlements,
      subscription: sub ? this.present(sub) : null,
      /** Se puede iniciar (o retomar) un checkout ahora. */
      canCheckout,
      /** Precio que cobraría un checkout ahora (lo decide el backend; con la oferta si es elegible). */
      checkoutPrice: canCheckout ? await this.checkoutPrice(this.dataSource.manager, p) : null,
      /** Ya tuvo una suscripción autorizada ("Volver a PRO"). */
      hadSubscription,
    };
  }

  /**
   * Cancela la RENOVACIÓN en el proveedor: lo ya pagado se conserva.
   *
   *   reconciliar (suscripción + cobros) → lock → fin del período pago →
   *   cancelar en el proveedor → CANCELLED con `accessUntil` → derivar PRO
   *
   * La reconciliación previa trae el primer cobro aunque su aviso no haya
   * llegado. Si el proveedor no confirma la cancelación, no cambia nada acá.
   */
  async cancel(profile: ProfessionalProfile) {
    this.assertEnabled();
    const open = await this.openSubscription(this.dataSource.manager, profile.id);
    if (open && open.status !== BillingSubscriptionStatus.PENDING) {
      await this.reconciler.reconcileById(open.id).catch((error: Error) => {
        this.logger.warn(`billing reconcile antes de cancelar falló: ${error.message}`);
      });
    }
    await this.dataSource.transaction(async (m) => {
      await m.findOne(ProfessionalProfile, {
        where: { id: profile.id },
        lock: { mode: 'pessimistic_write' },
      });
      const sub = await this.openSubscription(m, profile.id, true);
      if (!sub) {
        throw AppException.conflict(
          ErrorCode.BILLING_NO_SUBSCRIPTION,
          'No tenés una suscripción activa para cancelar.',
        );
      }
      const now = new Date();
      let accessUntil: Date | null = null;
      if (sub.status === BillingSubscriptionStatus.ACTIVE && sub.providerSubscriptionId) {
        const fresh = await this.provider.getSubscription(sub.providerSubscriptionId).catch(() => null);
        accessUntil = paidThrough(sub, fresh?.nextPaymentDate ?? null);
      } else if (sub.status === BillingSubscriptionStatus.PAST_DUE) {
        accessUntil = paidThrough(sub, null);
      }
      let remote: ProviderSubscription | null = null;
      if (sub.providerSubscriptionId) {
        try {
          remote = await this.provider.cancelSubscription(sub.providerSubscriptionId);
        } catch (error) {
          throw this.providerError(error, 'No pudimos cancelar la suscripción. Intentá nuevamente.');
        }
        if (!/^cancel+ed$/i.test(remote.status)) {
          throw this.providerError(
            new Error(`estado ${remote.status}`),
            'No pudimos cancelar la suscripción. Intentá nuevamente.',
          );
        }
      }
      await m.update(BillingSubscription, sub.id, {
        status: BillingSubscriptionStatus.CANCELLED,
        cancelledAt: now,
        accessUntil: accessUntil && accessUntil > now ? accessUntil : null,
        providerStatus: remote?.status.slice(0, 32) ?? sub.providerStatus,
        providerUpdatedAt: remote?.lastModified ?? sub.providerUpdatedAt,
        lastProviderSyncAt: now,
      });
      await this.reconciler.syncProfileAccess(m, profile.id, now);
      await recordFunnelEvent(m, {
        type: FunnelEventType.PRO_CANCELLED,
        professionalId: profile.id,
        ref: sub.id,
      });
      this.logger.log(`billing subscription cancelled ${sub.id}`);
    });
    return this.status(profile);
  }

  // ---------------------------------------------------------------------------

  /** Precio del checkout: oferta de bienvenida si el backend la da por elegible; si no, el normal. */
  async checkoutPrice(m: EntityManager, p: ProfessionalProfile): Promise<CheckoutPrice> {
    const baseAmount = proMonthlyPrice(this.config);
    const currency = this.config.get<string>('MP_CURRENCY', 'ARS');
    const offer = await presentIntroOffer(m, p, await freeQuoteUsage(m, p.id), this.config);
    return offer.eligible
      ? {
          amount: offer.discountedPriceArs,
          baseAmount,
          currency,
          offerCode: offer.offerCode,
          offerCycles: offer.appliesToCycles,
          discountPercent: offer.discountPercent,
        }
      : {
          amount: baseAmount,
          baseAmount,
          currency,
          offerCode: null,
          offerCycles: null,
          discountPercent: null,
        };
  }

  private present(s: BillingSubscription) {
    const grace = billingGraceDays(this.config) * DAY_MS;
    return {
      id: s.id,
      status: s.status,
      provider: s.provider,
      currentAmount: s.currentAmount,
      baseAmount: s.baseAmount,
      currency: s.currency,
      /** Próximo cobro (solo con la suscripción viva). */
      nextPaymentAt:
        s.status === BillingSubscriptionStatus.ACTIVE || s.status === BillingSubscriptionStatus.PAST_DUE
          ? s.nextPaymentAt
          : null,
      /** Cancelada: PRO hasta esta fecha (null = ya terminó o no había período pago). */
      accessUntil: s.status === BillingSubscriptionStatus.CANCELLED ? s.accessUntil : null,
      /** PAST_DUE: PRO se mantiene hasta acá mientras Mercado Pago reintenta. */
      graceUntil:
        s.status === BillingSubscriptionStatus.PAST_DUE && s.pastDueSince
          ? new Date(s.pastDueSince.getTime() + grace)
          : null,
      /** Solo PENDING: retomar el checkout en Mercado Pago. */
      checkoutUrl: s.status === BillingSubscriptionStatus.PENDING ? s.checkoutUrl : null,
      offerCode: s.offerCode,
      /** El precio promocional ya se cobró; los siguientes ciclos van a precio normal. */
      offerRedeemed: !!s.offerRedeemedAt,
      returnPath: s.returnPath,
      createdAt: s.createdAt,
    };
  }

  /** La suscripción que corresponde mostrar: la abierta, o la última cancelada. */
  private async visibleSubscription(professionalId: string): Promise<BillingSubscription | null> {
    const repo = this.dataSource.getRepository(BillingSubscription);
    return (
      (await this.openSubscription(this.dataSource.manager, professionalId)) ??
      (await repo.findOne({
        where: { professionalId, status: BillingSubscriptionStatus.CANCELLED, authorizedAt: Not(IsNull()) },
        order: { cancelledAt: 'DESC' },
      }))
    );
  }

  private openSubscription(m: EntityManager, professionalId: string, lock = false) {
    return m.findOne(BillingSubscription, {
      where: { professionalId, status: In([...OPEN_SUBSCRIPTION_STATUSES]) },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
  }

  private shouldSync(s: BillingSubscription): boolean {
    return !s.lastProviderSyncAt || Date.now() - s.lastProviderSyncAt.getTime() > PENDING_SYNC_MS;
  }

  /** Un PENDING se reutiliza si sigue vigente y con el MISMO precio que se cobraría hoy. */
  private reusable(s: BillingSubscription, price: CheckoutPrice): boolean {
    const ttl = this.config.get<number>('BILLING_PENDING_TTL_HOURS', 24) * 3_600_000;
    return (
      !!s.checkoutUrl &&
      !!s.providerSubscriptionId &&
      Date.now() - s.createdAt.getTime() < ttl &&
      s.currentAmount === price.amount &&
      // Un checkout creado con otro precio base subiría a ese precio después de la promo.
      s.baseAmount === price.baseAmount &&
      s.offerCode === price.offerCode
    );
  }

  /**
   * Antes de crear otro checkout: cierra el PENDING vencido o con otro
   * precio (y el PAUSED) también en el proveedor. Si el proveedor no
   * responde para un PENDING, igual se cierra acá: si alguien lo autoriza
   * después, la reconciliación lo cancela allá (huérfana).
   */
  private async closeBeforeReplacing(m: EntityManager, s: BillingSubscription): Promise<void> {
    if (s.providerSubscriptionId) {
      try {
        await this.provider.cancelSubscription(s.providerSubscriptionId);
      } catch (error) {
        if (s.status !== BillingSubscriptionStatus.PENDING) throw this.providerError(error);
        this.logger.warn(
          `billing no se pudo cancelar el checkout viejo ${s.id}: ${(error as Error).message}`,
        );
      }
    }
    await m.update(BillingSubscription, s.id, {
      status: BillingSubscriptionStatus.CANCELLED,
      cancelledAt: new Date(),
      accessUntil: null,
    });
  }

  private async payerEmail(userId: string): Promise<string> {
    const testEmail = this.config.get<string>('MP_TEST_PAYER_EMAIL');
    if (this.config.get<string>('MP_ENV', 'test') === 'test' && testEmail) return testEmail;
    const [row] = await this.dataSource.query<{ email: string }[]>(`SELECT email FROM users WHERE id = $1`, [
      userId,
    ]);
    return row.email;
  }

  private frontendUrl(): string {
    return this.config.get<string>('FRONTEND_URL', 'http://localhost:4200').split(',')[0].trim();
  }

  private assertEnabled(): void {
    if (!this.enabled) {
      throw new AppException(
        ErrorCode.BILLING_NOT_CONFIGURED,
        'La contratación online todavía no está habilitada.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private providerError(error: unknown, message = 'No pudimos iniciar la suscripción. Intentá nuevamente.') {
    this.logger.warn(`billing provider error: ${(error as Error)?.message ?? error}`);
    return new AppException(ErrorCode.BILLING_PROVIDER_ERROR, message, HttpStatus.BAD_GATEWAY);
  }
}
