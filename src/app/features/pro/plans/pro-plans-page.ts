import { PlanOptions } from '../../../shared/components/plan-options/plan-options';
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
import { avatarOf } from '../../../core/models/avatar';
import { coverageText } from '../../../core/models/professional';
import { BillingStore } from '../../../core/state/billing.store';
import { PlansStore } from '../../../core/state/plans.store';
import { ProStore } from '../../../core/state/pro.store';
import { checkoutCta } from '../../../core/utils/billing-copy';
import { oneDecimal } from '../../../core/utils/format';
import {
  offerPriceLine,
  offerTitle,
  proPriceAmount,
} from '../../../core/utils/quote-usage';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { Dialog } from '../../../shared/components/dialog/dialog';
import { Icon, IconName } from '../../../shared/components/icon/icon';
import { ProTrialSummaryView } from './pro-trial-summary';
import { FeaturedLabel } from '../../../shared/components/plan-badges/plan-badges';
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
import { noReviewsText } from '../../../core/utils/reputation';
import { FREE_WORK_LIMIT, PHOTOS_PER_WORK, PRO_WORK_LIMIT, WorkPhotosStore } from '../../../core/state/work-photos.store';
import { WorkCoverItem, WorkCovers } from '../../../shared/components/work-covers/work-covers';
import { LocalDemandPanel } from './local-demand-panel';
import { priceAnchorText } from '../../../core/utils/pro-value';

/**
 * Lo que suma PRO, en tres cosas y en el orden en que se vende: visibilidad, oportunidades y
 * presentación. Solo ventajas que Free no tiene: WhatsApp, llamadas, solicitudes y reseñas son
 * de los dos planes y se dicen aparte (`PRO_FREE_NOTE`), nunca como un beneficio de PRO.
 */
export const PRO_PILLARS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'star',
    title: 'Destacate cuando te buscan',
    text: 'Tu perfil puede aparecer en espacios Destacados, con fotos de tus trabajos, cuando buscan tu servicio en tu ciudad.',
  },
  {
    icon: 'clock',
    title: 'Enterate antes y respondé sin límite',
    text: 'Las solicitudes nuevas te llegan antes que a los perfiles Free y presupuestás sin el límite de Free.',
  },
  {
    icon: 'camera',
    title: 'Mostrá más y medí el interés',
    text: `Hasta ${PRO_WORK_LIMIT} trabajos con ${PHOTOS_PER_WORK} fotos cada uno (Free: ${FREE_WORK_LIMIT}), portada y Tu mes completo.`,
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
    ReferralsPanel,
    RouterLink,
    Avatar,
    Dialog,
    Icon,
    FeaturedLabel,
    ProPlanChangePanel,
    ProSubscriptionPanel,
    ProTransferPanel,
    ProValuePanel,
    WithoutProPanel,
    ProTrialSummaryView,
    WorkCovers,
    LocalDemandPanel,
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
  protected readonly transferOffered = computed(() => this.transfer.offered() && this.isPro() === false);
  /** Se puede programar el paso a PRO Plus (Mercado Pago o transferencia): cambia el texto de la tarjeta de Plus. */
  protected readonly planChangeAvailable = computed(() => {
    const t = this.transfer.overview();
    return !!this.billing.planChangeOptions()?.available || (!!t?.scheduledPlus && !!t.plusOptions?.length);
  });
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
  /** Trabajos que permite el plan ACTUAL (lo que dice "Tu plan incluye…"). */
  protected readonly currentWorkLimit = computed(() => this.store.plan()?.entitlements.portfolioWorkLimit ?? FREE_WORK_LIMIT);
  /** Trabajos que ofrece PRO: lo que se le muestra a quien todavía no lo tiene, nunca su límite actual. */
  protected readonly offeredProWorkLimit = PRO_WORK_LIMIT;
  protected readonly accountName = computed(() => this.store.plan()?.tier === 'PRO_PLUS' ? 'PRO Plus' : 'PRO');
  protected readonly canChoose = computed(() => this.isPro() === false && (this.canBuy() || this.transferOffered()));

  protected choosePlan(tier: 'PRO' | 'PRO_PLUS'): void {
    // Un clic por plan elegido (PLAN_PAGE = PRO, PLAN_PLUS = PRO Plus): el checkout y el cobro los registra el backend.
    this.funnel.track('PRO_CTA_CLICKED', tier === 'PRO_PLUS' ? 'PLAN_PLUS' : 'PLAN_PAGE');
    if (this.selfServe() && this.canBuy()) {
      if (tier === 'PRO' && this.offer()) this.store.trackOffer('CLICKED', 'PLAN_PAGE');
      void this.billing.createCheckout(undefined, tier);
    } else if (this.transferOffered()) {
      this.transferPanel()?.selectPlan(tier);
    } else if (tier === 'PRO') this.openWant();
  }
  private readonly photos = inject(WorkPhotosStore);
  /**
   * Fotos de la vista previa de Destacado: las portadas de SUS trabajos si ya tiene (reales),
   * si no, fotos de muestra rotuladas "Ejemplo". Nunca se mezclan.
   */
  protected readonly previewCovers = computed<{ covers: WorkCoverItem[]; example: boolean } | null>(() => {
    if (!this.photos.loaded()) return null;
    const own = this.photos
      .activeWorks()
      .filter((w) => w.photos.some((p) => !p.archivedByPlan))
      .slice(0, 3)
      .map((w) => ({ title: w.title, url: w.photos.find((p) => !p.archivedByPlan)!.url }));
    return own.length ? { covers: own, example: false } : { covers: DEMO_WORK_COVERS, example: true };
  });
  /** "Tu presupuesto aceptado más alto … equivale a N meses de PRO" (null = no alcanza un mes o no hay). */
  protected readonly anchor = computed(() => {
    const m = this.month();
    return m ? priceAnchorText(m) : null;
  });
  /** "$500" por día (mismo cálculo que "Tu mes"); sin precio, null. */
  protected readonly perDay = computed(() => {
    const ars = this.info()?.pro.monthlyPriceArs;
    return ars ? proPriceAmount(Math.round(ars / 30)) : null;
  });

  /** null mientras se carga /pro/me: no se afirma ningún plan. */
  protected readonly isPro = this.store.hasPro;
  /** Prueba de PRO en curso (los días vienen de la misma fuente que las recompensas, pero se cuenta distinto). */
  protected readonly proTrialActive = computed(() => this.store.proTrial()?.state === 'ACTIVE');
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
  protected readonly trialActive = computed(() => !!this.store.plan()?.trialActive);
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
  protected readonly meNoReviews = computed(() => noReviewsText(this.me() ?? {}));
  protected readonly meAvatar = computed(() => {
    const p = this.me();
    return p ? avatarOf(p) : null;
  });
  protected readonly meRating = computed(() => {
    const p = this.me();
    return p && p.averageRating !== null && p.reviewsCount > 0
      ? `${oneDecimal(p.averageRating)} · ${p.reviewsCount} ${p.reviewsCount === 1 ? 'reseña' : 'reseñas'}`
      : null;
  });
  protected readonly meWhat = computed(() => {
    const p = this.me();
    if (!p) return '';
    const what = p.services.map((s) => s.name).join(', ') || p.headline;
    return p.yearsExperience
      ? `${what} · ${p.yearsExperience} ${p.yearsExperience === 1 ? 'año' : 'años'}`
      : what;
  });
  protected readonly meZones = computed(() => {
    const p = this.me();
    return p ? coverageText(p) : '';
  });

  // ---- Contratación ---------------------------------------------------------
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
    this.selfServe() ? checkoutCta(this.billing.status()) : 'Quiero Resuelve PRO',
  );
  /** Checkout en curso (o billing todavía sin cargar): el botón no responde dos veces. */
  protected readonly ctaBusy = computed(
    () => this.selfServe() && (this.billing.starting() || !this.billing.status()),
  );

  // ---- "Quiero PRO" (sin billing) -------------------------------------------
  protected readonly wantOpen = signal(false);
  /** Se registró en esta apertura del diálogo (muestra la confirmación). */
  protected readonly justRequested = signal(false);

  constructor() {
    this.plans.load();
    if (!this.photos.loaded()) void this.photos.load();
    void this.transfer.load();
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      this.analytics.getMonth().subscribe({ next: (m) => this.month.set(m), error: () => this.month.set(null) });
    }
    this.funnel.track('PRO_PLAN_VIEWED', 'PLAN_PAGE');
    effect((onCleanup) => {
      // La oferta se vio de verdad cuando las tarjetas entran en pantalla: solo a un Free con los planes cargados,
      // nunca a quien ya es PRO. Abrir Mi plan sin llegar a ellas no cuenta (PLAN_PAGE es la visita).
      const el = this.offerSection()?.nativeElement;
      if (!el || this.isPro() !== false || !this.info() || typeof IntersectionObserver === 'undefined') return;
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

  /** "Pagá por transferencia" (hero): abre el desplegable antes de que el router baje hasta él. */
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
