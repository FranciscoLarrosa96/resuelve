import { MetricNotes } from './metric-notes';
import { PRO_EARLY_ACCESS, PRO_RESPONSE_BENEFIT } from '../../../core/utils/pro-benefits';
import { PlanOptions } from '../../../shared/components/plan-options/plan-options';
import { PlanUseCases } from '../../../shared/components/plan-options/plan-use-cases';
import { ReferralsPanel } from '../../../shared/components/acquisition/referrals-panel';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  PLATFORM_ID,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { BillingStore } from '../../../core/state/billing.store';
import { PlansStore } from '../../../core/state/plans.store';
import { ProStore } from '../../../core/state/pro.store';
import { checkoutCta } from '../../../core/utils/billing-copy';
import {
  offerPriceLine,
  offerTitle,
  proPriceAmount,
} from '../../../core/utils/quote-usage';
import { Dialog } from '../../../shared/components/dialog/dialog';
import { Icon, IconName } from '../../../shared/components/icon/icon';
import { ProTrialSummaryView } from './pro-trial-summary';
import { ProPlanChangePanel } from './pro-plan-change-panel';
import { ProSubscriptionPanel } from './pro-subscription-panel';
import { ProTransferPanel } from './pro-transfer-panel';
import { ProValuePanel } from './pro-value-panel';
import { WithoutProPanel } from './without-pro-panel';
import { ProAnalyticsApiService } from '../../../core/api/pro-analytics-api.service';
import { MonthAnalytics } from '../../../core/models/pro-analytics';
import { isPlatformBrowser } from '@angular/common';
import { TransferStore } from '../../../core/state/transfer.store';
import { FunnelTracker } from '../../../core/analytics/funnel-tracker';
import { PHOTOS_PER_WORK, PRO_WORK_LIMIT, WorkPhotosStore } from '../../../core/state/work-photos.store';
import { WorkCoverItem } from '../../../shared/components/work-covers/work-covers';
import { LocalDemandPanel } from './local-demand-panel';
import { ProTrialOffer } from './pro-trial-offer';
import { PlanProfilePreview } from './plan-profile-preview';

/**
 * Lo que suma PRO, en tres cosas y en el orden en que se vende: visibilidad, oportunidades y
 * presentación. Solo ventajas que Free no tiene: WhatsApp, llamadas, solicitudes y reseñas son
 * de los dos planes y se dicen aparte (`PRO_FREE_NOTE`), nunca como un beneficio de PRO.
 */
export const PRO_PILLARS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'star',
    title: 'Destacate cuando te buscan',
    text: 'Tu perfil y las fotos de tus trabajos pueden aparecer en espacios Destacados cuando buscan tus servicios donde trabajás.',
  },
  {
    icon: 'clock',
    title: PRO_RESPONSE_BENEFIT,
    text: PRO_EARLY_ACCESS,
  },
  {
    icon: 'camera',
    title: 'Mostrá más y medí el interés',
    text: `Publicá hasta ${PRO_WORK_LIMIT} trabajos con ${PHOTOS_PER_WORK} fotos cada uno, sumá una portada y consultá Tu mes completo. Los trabajos con fotos requieren PRO.`,
  },
];

/** Debajo de los beneficios: lo que no se paga, para que nadie crea que PRO lo habilita. */
export const PRO_FREE_NOTE =
  'Tu perfil, WhatsApp, llamadas, solicitudes y reseñas siguen siendo gratis en Free.';

/**
 * Portadas de muestra para la vista previa de Destacado cuando todavía no subió trabajos
 * (`public/portfolio-demo/`, las mismas del editor de trabajos): siempre rotuladas "Ejemplo".
 */
export const DEMO_WORK_COVERS: WorkCoverItem[] = [
  { title: 'Ejemplo: tablero eléctrico armado', url: '/portfolio-demo/electrica-1.webp' },
  { title: 'Ejemplo: cocina renovada', url: '/portfolio-demo/cocina-1.webp' },
  { title: 'Ejemplo: ducha con mampara', url: '/portfolio-demo/ducha-1.webp' },
];

/** "26 de septiembre" / "31 de diciembre de 2026" (hora de Argentina). */
function longDate(iso: string, withYear = false): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(iso));
}

/**
 * Resuelve PRO, para vender sin mentir: "Hacé que más clientes te encuentren".
 * Primero visibilidad (destacados con TU perfil real), después qué ves en Tu
 * mes y recién al final el cupo; lo gratis de los dos planes se dice como
 * gratis. Comparación y precio real de GET /plans.
 * Con billing (`/plans` → `selfServe`): "Quiero Resuelve PRO" crea el checkout
 * de Mercado Pago y navega a su `init_point`; el estado (pendiente, activa,
 * con problema de cobro, cancelada) sale de GET /billing/pro/status.
 * Sin billing: "Quiero Resuelve PRO" registra el pedido (POST /pro/plan/interest) y
 * PRO se activa a mano. Nunca se simula una contratación.
 * Oferta de bienvenida: solo si el backend la trae elegible; el precio normal
 * se sigue viendo.
 */
@Component({
  selector: 'app-pro-plans-page',
  imports: [
    PlanOptions,
    PlanUseCases,
    MetricNotes,
    ReferralsPanel,
    RouterLink,
    Dialog,
    Icon,
    ProPlanChangePanel,
    ProSubscriptionPanel,
    ProTransferPanel,
    ProValuePanel,
    WithoutProPanel,
    ProTrialSummaryView,
    LocalDemandPanel,
    ProTrialOffer,
    PlanProfilePreview,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-plans-page.html',
  styleUrl: './pro-plans-page.css',
})
export class ProPlansPage {
  protected readonly store = inject(ProStore);
  private readonly funnel = inject(FunnelTracker);
  private readonly plans = inject(PlansStore);
  protected readonly billing = inject(BillingStore);
  private readonly transfer = inject(TransferStore);
  /** Se puede pagar por transferencia ahora (datos cargados, sin otro PRO pagado). */
  protected readonly transferBusy = this.transfer.busy;
  protected readonly transferOffered = computed(() => this.transfer.offered() && this.purchaseAudience());
  /**
   * Dónde va el panel de transferencia, decidido una vez al cargar: arriba si hay algo en curso
   * (pago por hacer o en revisión, rechazo, devolución o arrepentimiento vigente); si no, en
   * "Contratar PRO", al final. Se fija una sola vez para que el panel no salte de lugar al usarlo.
   * null = todavía no cargó.
   */
  protected readonly transferOnTop = signal<boolean | null>(null);
  private readonly transferPanel = viewChild(ProTransferPanel);
  private readonly offerSection = viewChild<ElementRef<HTMLElement>>('offerSection');

  private readonly analytics = inject(ProAnalyticsApiService);
  /** Tu mes en curso: lo que sumó PRO (PRO) o lo que pasó sin PRO (Free). null = sin datos: no se muestra. */
  protected readonly month = signal<MonthAnalytics | null>(null);

  /** `?quiero=1` (desde "Quiero Resuelve PRO"): abre el pedido al entrar. */
  readonly quiero = input<string | undefined>();

  protected readonly info = this.plans.info;
  protected readonly pillars = PRO_PILLARS;
  protected readonly proFreeNote = PRO_FREE_NOTE;
  protected readonly accountName = computed(() => 'PRO');
  protected readonly purchaseAudience = computed(() => this.isPro() === false || this.proTrialActive());
  protected readonly canChoose = computed(() => this.purchaseAudience() && (this.canBuy() || this.transferOffered()));
  protected readonly paymentPlan = signal<'PRO' | 'PRO_PLUS' | null>(null);
  protected readonly paymentName = computed(() => 'PRO');
  protected readonly paymentPrice = computed(() => {
    const s = this.billing.status();
    const price = this.paymentPlan() === 'PRO_PLUS' ? s?.plusCheckoutPrice : s?.checkoutPrice;
    return price ? proPriceAmount(price.amount) : null;
  });
  protected readonly paymentRegularPrice = computed(() => {
    const s = this.billing.status();
    const price = this.paymentPlan() === 'PRO_PLUS' ? s?.plusCheckoutPrice : s?.checkoutPrice;
    return price && price.amount < price.baseAmount ? proPriceAmount(price.baseAmount) : null;
  });

  protected choosePlan(tier: 'PRO' | 'PRO_PLUS'): void {
    tier = 'PRO';
    if (!this.canChoose() || this.ctaBusy() || this.transferBusy()) return;
    // Un clic de intención; el checkout y el cobro los registra el backend.
    this.funnel.track('PRO_CTA_CLICKED', 'PLAN_PAGE');
    if (this.selfServe() && this.canBuy()) {
      if (tier === 'PRO' && this.offer()) this.store.trackOffer('CLICKED', 'PLAN_PAGE');
      // Durante la prueba se confirma siempre que la compra no posterga el cobro.
      if (this.transferOffered() || this.proTrialActive()) this.paymentPlan.set(tier);
      else void this.billing.createCheckout(undefined, tier);
    } else if (this.transferOffered()) {
      this.transferPanel()?.selectPlan(tier);
    } else if (tier === 'PRO') this.openWant();
  }

  protected async payWithMercadoPago(): Promise<void> {
    const tier = this.paymentPlan();
    if (!tier || !this.canBuy() || this.billing.starting()) return;
    if (await this.billing.createCheckout(undefined, tier)) this.paymentPlan.set(null);
  }

  protected payWithTransfer(): void {
    const tier = this.paymentPlan();
    if (!tier || !this.transferOffered() || this.transferBusy() || this.billing.starting()) return;
    this.paymentPlan.set(null);
    this.transferPanel()?.selectPlan(tier, { focus: true });
  }
  private readonly photos = inject(WorkPhotosStore);
  /**
   * Fotos de la vista previa de Destacado: las portadas de SUS trabajos si ya tiene (reales),
   * si no, fotos de muestra rotuladas "Ejemplo". Nunca se mezclan.
   */
  protected readonly previewCovers = computed<{ covers: WorkCoverItem[]; example: boolean } | null>(() => {
    if (!this.photos.loaded()) return null;
    const own = this.photos
      .works()
      .filter((w) => w.photos.length > 0)
      .slice(0, 3)
      .map((w) => ({ title: w.title, url: w.photos[0].url }));
    return own.length ? { covers: own, example: false } : { covers: DEMO_WORK_COVERS, example: true };
  });
  /** "$500" por día (mismo cálculo que "Tu mes"); sin precio, null. */
  protected readonly perDay = computed(() => {
    const ars = this.info()?.pro.monthlyPriceArs;
    return ars ? proPriceAmount(Math.round(ars / 30)) : null;
  });

  /** null mientras se carga /pro/me: no se afirma ningún plan. */
  protected readonly isPro = this.store.hasPro;
  /** Prueba de PRO en curso (los días vienen de la misma fuente que las recompensas, pero se cuenta distinto). */
  protected readonly proTrialActive = computed(() => this.store.proTrial()?.state === 'ACTIVE' && this.store.plan()?.source === 'BONUS');
  protected readonly trialPreparation = computed(() => {
    const t = this.store.proTrial();
    if (t?.state !== 'UNAVAILABLE') return null;
    const next: Record<string, { text: string; edit?: string }> = {
      PROFILE_NOT_PUBLISHED: { text: 'Publicá tu perfil para habilitar tu prueba de PRO.' },
      MISSING_AVATAR: { text: 'Agregá tu foto de perfil para habilitar tu prueba de PRO.', edit: 'avatar' },
      MISSING_WORK_PHOTO: { text: 'Actualizá tu perfil e intentá activar la prueba nuevamente.', edit: 'profile' },
      NO_CONTACT_CHANNEL: { text: 'Habilitá un canal de contacto para habilitar tu prueba de PRO.', edit: 'contact' },
    };
    return next[t.reason] ?? null;
  });
  /** Resumen de la prueba terminada, para decidir en Mi plan (solo si volvió a Free). */
  protected readonly trialSummary = computed(() =>
    this.isPro() === false && this.store.proTrial()?.state === 'ENDED' ? this.store.trialSummary() : null,
  );
  /** Un pago pendiente, con problema, pausado o revocado: se muestra arriba, antes que el valor del plan. */
  protected readonly billingNeedsAttention = computed(() => {
    const s = this.billing.subscription();
    return !!s && (s.status === 'PENDING' || s.status === 'PAST_DUE' || s.status === 'PAUSED' || !!s.withdrawnAt);
  });
  /** Fin del PRO vigente: manual con vencimiento, o pago y cancelado (fin del período ya pagado). */
  protected readonly proUntil = computed(() => {
    const plan = this.store.plan();
    const sub = this.billing.subscription();
    const iso =
      plan?.source === 'BILLING'
        ? sub?.status === 'CANCELLED'
          ? sub.accessUntil
          : null
        : plan?.expiresAt;
    return iso ? longDate(iso, true) : null;
  });
  /** "$15.000" (null hasta que responde /plans: nunca un precio escrito a mano). */
  protected readonly price = computed(() => {
    const ars = this.info()?.pro.monthlyPriceArs;
    return ars ? proPriceAmount(ars) : null;
  });
  protected readonly freeLimit = computed(() => this.info()?.free.quoteLimit ?? null);
  protected readonly freeQuota = computed(() => {
    const u = this.store.ownProfile()?.quoteUsage;
    return u && this.isPro() === false && u.limit !== null ? u : null;
  });
  /** Pedido "Quiero PRO" ya registrado (fecha real del backend). */
  protected readonly requestedOn = computed(() => {
    const iso = this.store.ownProfile()?.proInterestAt;
    return iso ? longDate(iso) : null;
  });

  // ---- Oferta de bienvenida (la decide el backend; PRO o ya usada = null) ----
  protected readonly offer = computed(() =>
    this.isPro() === false ? this.store.introOffer() : null,
  );
  protected readonly offerTitle = computed(() => {
    const o = this.offer();
    return o ? offerTitle(o) : null;
  });
  /** "Primer mes $12.000 · 20% OFF": montos del backend, solo con la oferta elegible HOY. */
  protected readonly heroOffer = computed(() => {
    const o = this.offer();
    if (!o) return null;
    const when = o.appliesToCycles === 1 ? 'Primer mes' : `Primeros ${o.appliesToCycles} meses`;
    return `${when} ${proPriceAmount(o.discountedPriceArs)} · ${o.discountPercent}% OFF`;
  });
  protected readonly offerPrices = computed(() => {
    const o = this.offer();
    return o ? offerPriceLine(o) : null;
  });
  /** El pedido ya está hecho y no queda una oferta nueva por reservar. */
  protected readonly requestDone = computed(
    () => !!this.requestedOn() && (!this.offer() || !!this.offer()?.reserved),
  );

  // ---- Tu perfil, como se vería en un espacio destacado ----------------------
  protected readonly me = computed(() => this.store.ownProfile());
  /** true = se contrata online con Mercado Pago (lo dice el backend). */
  protected readonly selfServe = computed(() => !!this.info()?.pro.selfServe);
  /**
   * Mostrar el botón de contratar. Con billing: solo si el backend lo permite
   * (sin PRO vigente ni suscripción viva) y sin un checkout pendiente (ese se
   * retoma desde "Tu plan actual"). Sin billing: cualquier Free.
   */
  protected readonly canBuy = computed(() => {
    if (!this.selfServe()) return this.isPro() === false;
    const s = this.billing.status();
    return !!s?.canCheckout && s.subscription?.status !== 'PENDING';
  });
  protected readonly ctaLabel = computed(() =>
    this.proTrialActive() ? 'Continuar con PRO' : this.selfServe() ? checkoutCta(this.billing.status()) : 'Quiero Resuelve PRO',
  );
  /** Checkout en curso: el botón no responde dos veces; un error de billing no bloquea transferencia. */
  protected readonly ctaBusy = computed(
    () => this.billing.starting(),
  );

  // ---- "Quiero PRO" (sin billing) -------------------------------------------
  protected readonly wantOpen = signal(false);
  /** Se registró en esta apertura del diálogo (muestra la confirmación). */
  protected readonly justRequested = signal(false);

  constructor() {
    this.plans.load();
    if (!this.photos.loaded()) void this.photos.load();
    void this.transfer.load();
    if (isPlatformBrowser(inject(PLATFORM_ID))) this.refreshMonth();
    this.funnel.track('PRO_PLAN_VIEWED', 'PLAN_PAGE');
    effect((onCleanup) => {
      // La oferta se vio de verdad cuando las tarjetas entran en pantalla: solo a un Free con los planes cargados,
      // nunca a quien ya es PRO. Abrir Mi plan sin llegar a ellas no cuenta (PLAN_PAGE es la visita).
      const el = this.offerSection()?.nativeElement;
      if (!el || !this.purchaseAudience() || !this.info() || typeof IntersectionObserver === 'undefined') return;
      const observer = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        this.funnel.track('PRO_PLAN_VIEWED', 'PLAN_OFFER');
      }, { threshold: 0.25 });
      observer.observe(el);
      onCleanup(() => observer.disconnect());
    });
    effect(() => {
      if (this.selfServe()) untracked(() => void this.billing.loadStatus());
    });
    effect(() => {
      // Sin billing, `?quiero=1` abre el pedido. Con billing nunca se sale a Mercado Pago sin un click.
      if (this.quiero() && this.info() && !this.selfServe() && this.isPro() === false) {
        untracked(() => this.wantOpen.set(true));
      }
    });
    effect(() => {
      if (this.offer()) untracked(() => this.store.trackOffer('SHOWN', 'PLAN_PAGE'));
    });
    effect(() => {
      if (this.isPro() === false && this.store.proTrial()?.state === 'ENDED') {
        untracked(() => void this.store.loadTrialSummary());
      }
    });
    effect(() => {
      const o = this.transfer.overview();
      if (!o || untracked(this.transferOnTop) !== null) return;
      const ongoing =
        o.available &&
        (!!o.pending || this.transfer.outcome()?.status === 'REJECTED' || !!o.withdrawal || !!o.refundPending);
      untracked(() => this.transferOnTop.set(ongoing));
    });
  }

  protected refreshMonth(): void {
    this.analytics.getMonth().subscribe({ next: (m) => this.month.set(m), error: () => this.month.set(null) });
  }

  /** "Pagá por transferencia": abre el desplegable antes de que el router baje hasta él. */
  protected revealTransfer(): void {
    this.transferPanel()?.expand();
  }

  protected openWant(): void {
    if (this.offer()) this.store.trackOffer('CLICKED', 'PLAN_PAGE');
    this.justRequested.set(false);
    this.wantOpen.set(true);
  }

  protected async register(): Promise<void> {
    if (await this.store.requestPro()) this.justRequested.set(true);
  }
}
