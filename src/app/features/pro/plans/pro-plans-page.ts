import { ReferralsPanel } from '../../../shared/components/acquisition/referrals-panel';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
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
  quoteUsageNotice,
} from '../../../core/utils/quote-usage';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { Dialog } from '../../../shared/components/dialog/dialog';
import { Icon, IconName } from '../../../shared/components/icon/icon';
import { FeaturedLabel } from '../../../shared/components/plan-badges/plan-badges';
import { ProSubscriptionPanel } from './pro-subscription-panel';
import { ProTransferPanel } from './pro-transfer-panel';
import { TransferStore } from '../../../core/state/transfer.store';
import { FunnelTracker } from '../../../core/analytics/funnel-tracker';
import { noReviewsText } from '../../../core/utils/reputation';
import { FREE_WORK_LIMIT, PHOTOS_PER_WORK, PRO_WORK_LIMIT } from '../../../core/state/work-photos.store';

/** true/false = incluido o no; texto = valor ("5 incluidas", "Sin límite"). */
type Cell = boolean | string;

interface CompareGroup {
  title: string;
  rows: { label: string; free: Cell; pro: Cell }[];
}

/**
 * Lo que suma PRO, en el orden en que se vende: visibilidad, presentación, estadísticas y, al final,
 * oportunidades. Solo ventajas que Free no tiene: WhatsApp, llamadas, solicitudes y reseñas son de los
 * dos planes y se dicen aparte (`PRO_FREE_NOTE`), nunca como un beneficio de PRO.
 */
export const PRO_PILLARS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'star',
    title: 'Destacate en búsquedas locales',
    text: 'Tu perfil puede aparecer en espacios destacados cuando buscan tu servicio en tu ciudad.',
  },
  {
    icon: 'camera',
    title: 'Mostrá más trabajos',
    text: `Hasta ${PRO_WORK_LIMIT} trabajos realizados con ${PHOTOS_PER_WORK} fotos cada uno, frente a ${FREE_WORK_LIMIT} en Free.`,
  },
  {
    icon: 'chart',
    title: 'Medí el interés en tu perfil',
    text: 'Visitas, apariciones en búsquedas y toques en WhatsApp y Llamar, mes a mes.',
  },
  {
    icon: 'infinity',
    title: 'Respondé más oportunidades',
    text: 'Sin el límite de Free para enviar presupuestos a solicitudes nuevas.',
  },
  {
    icon: 'clock',
    title: 'Enterate antes',
    text: 'Las solicitudes nuevas de tu zona te llegan antes que a los perfiles Free.',
  },
];

/** Debajo de los beneficios: lo que no se paga, para que nadie crea que PRO lo habilita. */
export const PRO_FREE_NOTE =
  'Tu perfil, WhatsApp, llamadas, solicitudes y reseñas siguen siendo gratis en Free.';

/** Lo que Free ya incluye (y PRO también): se dice antes de la comparación. */
export const FREE_INCLUDED: { icon: IconName; text: string }[] = [
  { icon: 'search', text: 'Perfil público en las búsquedas de tus localidades' },
  { icon: 'chat', text: 'Contacto por WhatsApp y llamadas, sin usar oportunidades' },
  { icon: 'inbox', text: 'Recibir solicitudes por Resuelve, si las tenés activadas' },
  { icon: 'siren', text: 'Atender urgencias' },
  { icon: 'share', text: 'Compartir tu perfil y pedir reseñas con enlace o QR' },
  { icon: 'camera', text: `${FREE_WORK_LIMIT} trabajo realizado con hasta ${PHOTOS_PER_WORK} fotos` },
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
    ReferralsPanel,
    RouterLink,
    Avatar,
    Dialog,
    Icon,
    FeaturedLabel,
    ProSubscriptionPanel,
    ProTransferPanel,
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
  protected readonly transferOffered = computed(() => this.transfer.offered() && this.isPro() === false);
  /**
   * Dónde va el panel de transferencia, decidido una vez al cargar: arriba si hay algo en curso
   * (pago por hacer o en revisión, rechazo, devolución o arrepentimiento vigente); si no, en
   * "Contratar PRO", al final. Se fija una sola vez para que el panel no salte de lugar al usarlo.
   * null = todavía no cargó.
   */
  protected readonly transferOnTop = signal<boolean | null>(null);
  private readonly transferPanel = viewChild(ProTransferPanel);

  /** `?quiero=1` (desde "Quiero Resuelve PRO"): abre el pedido al entrar. */
  readonly quiero = input<string | undefined>();

  protected readonly info = this.plans.info;
  protected readonly pillars = PRO_PILLARS;
  protected readonly proFreeNote = PRO_FREE_NOTE;
  protected readonly freeIncluded = FREE_INCLUDED;
  /** Reseñas de clientes invitados reales (aparte del puntaje); 0 si todavía no cargó el perfil. */
  protected readonly invitedReviews = computed(() => this.store.ownProfile()?.invitedReviewsCount ?? 0);
  protected readonly invitedReviewsText = computed(() => {
    const n = this.invitedReviews();
    return n === 1 ? 'Ya tenés 1 reseña de un cliente invitado.' : `Ya tenés ${n} reseñas de clientes invitados.`;
  });

  /** null mientras se carga /pro/me: no se afirma ningún plan. */
  protected readonly isPro = this.store.hasPro;
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
  /** Un segmento por oportunidad Free (hasta 20; con más, sin dibujo). */
  protected readonly freeSegments = computed(() => {
    const l = this.freeLimit();
    return l && l <= 20 ? Array.from({ length: l }, (_, i) => i) : [];
  });
  /** Uso Free histórico ("2 de 5"). */
  protected readonly usage = computed(() => {
    const u = this.store.ownProfile()?.quoteUsage;
    return u && this.isPro() === false ? quoteUsageNotice(u).counter : null;
  });
  protected readonly freeQuota = computed(() => {
    const u = this.store.ownProfile()?.quoteUsage;
    return u && this.isPro() === false && u.limit !== null ? u : null;
  });
  protected readonly trialActive = computed(() => !!this.store.plan()?.trialActive);
  /** Cuarto beneficio solo si la herramienta existe (flag real del backend). */
  protected readonly templatesReady = computed(() => !!this.info()?.pro.features.quoteTemplates);

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

  /**
   * Comparación honesta: lo que es de los dos planes va primero y con ✓ en Free. Los límites salen
   * del backend (/plans) o de su espejo (fotos); nada que Free tenga se marca como exclusivo de PRO.
   */
  protected readonly groups = computed<CompareGroup[]>(() => {
    const limit = this.freeLimit();
    return [
      {
        title: 'Tu perfil y tus contactos',
        rows: [
          { label: 'Perfil público en las búsquedas de tus localidades', free: true, pro: true },
          { label: 'Contacto por WhatsApp y llamadas', free: true, pro: true },
          { label: 'Recibir solicitudes por Resuelve', free: true, pro: true },
          { label: 'Atender urgencias', free: true, pro: true },
          { label: 'Compartir tu perfil y pedir reseñas', free: true, pro: true },
          { label: 'Agenda', free: true, pro: true },
          {
            label: `Trabajos realizados (hasta ${PHOTOS_PER_WORK} fotos cada uno)`,
            free: `${FREE_WORK_LIMIT}`,
            pro: `Hasta ${PRO_WORK_LIMIT}`,
          },
        ],
      },
      {
        title: 'Visibilidad y estadísticas',
        rows: [
          { label: 'Espacios destacados en búsquedas', free: false, pro: true },
          { label: 'Identificación PRO en tu perfil', free: false, pro: true },
          { label: 'Tu mes', free: 'Básico', pro: 'Completo' },
          { label: 'Visitas al perfil y apariciones', free: false, pro: true },
          { label: 'Toques en WhatsApp y Llamar', free: false, pro: true },
          { label: 'Embudo, servicios y barrios', free: false, pro: true },
          ...(this.templatesReady()
            ? [{ label: 'Plantillas de presupuesto', free: false, pro: true }]
            : []),
        ],
      },
      {
        title: 'Oportunidades',
        rows: [
          {
            label: 'Presupuestos a solicitudes nuevas',
            free: limit ? `${limit} en total` : 'Sin límite',
            pro: 'Sin límite',
          },
          {
            label: 'Presupuestos a clientes que te eligen',
            free: 'Sin límite',
            pro: 'Sin límite',
          },
          { label: 'Cuándo ves las solicitudes nuevas', free: 'Más tarde', pro: 'Antes' },
        ],
      },
    ];
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

  protected startPro(): void {
    this.funnel.track('PRO_CTA_CLICKED', 'PLAN_PAGE');
    if (!this.selfServe()) {
      this.openWant();
      return;
    }
    if (this.offer()) this.store.trackOffer('CLICKED', 'PLAN_PAGE');
    void this.billing.createCheckout();
  }

  // ---- "Quiero PRO" (sin billing) -------------------------------------------
  protected readonly wantOpen = signal(false);
  /** Se registró en esta apertura del diálogo (muestra la confirmación). */
  protected readonly justRequested = signal(false);

  constructor() {
    this.plans.load();
    void this.transfer.load();
    this.funnel.track('PRO_PLAN_VIEWED', 'PLAN_PAGE');
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
      const o = this.transfer.overview();
      if (!o || untracked(this.transferOnTop) !== null) return;
      const ongoing =
        o.available &&
        (!!o.pending || o.last?.status === 'REJECTED' || !!o.withdrawal || !!o.refundPending);
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
