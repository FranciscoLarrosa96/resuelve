import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { avatarOf } from '../../../core/models/avatar';
import { coverageText } from '../../../core/models/professional';
import { PlansStore } from '../../../core/state/plans.store';
import { ProStore } from '../../../core/state/pro.store';
import { oneDecimal } from '../../../core/utils/format';
import { proPriceAmount, quoteUsageNotice } from '../../../core/utils/quote-usage';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { Dialog } from '../../../shared/components/dialog/dialog';
import { Icon, IconName } from '../../../shared/components/icon/icon';
import { FeaturedLabel, ProBadge } from '../../../shared/components/plan-badges/plan-badges';

/** true/false = incluido o no; texto = valor ("10 / mes", "Sin límite"). */
type Cell = boolean | string;

interface CompareGroup {
  title: string;
  rows: { label: string; free: Cell; pro: Cell }[];
}

/**
 * EJEMPLO comercial de "Tu mes" PRO. No son datos de nadie: la página lo
 * rotula "Ejemplo" en el título y al pie. Los datos reales viven en /pro/estadisticas.
 */
export const EXAMPLE_MONTH = {
  funnel: [
    { label: 'Apariciones en búsquedas', value: '1.284', pct: 100 },
    { label: 'Visitas al perfil', value: '87', pct: 42 },
    { label: 'Solicitudes', value: '18', pct: 24 },
    { label: 'Presupuestos', value: '12', pct: 18 },
    { label: 'Aceptados', value: '5', pct: 10 },
  ],
  acceptedValue: '$1.840.000',
  insight: 'Electricidad fue tu servicio con más solicitudes.',
} as const;

const PILLARS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'infinity', title: 'Presupuestos sin límite', text: 'Respondé todas las oportunidades que te interesen.' },
  { icon: 'star', title: 'Más visibilidad', text: 'Espacios destacados cuando un cliente busca tu servicio.' },
  { icon: 'chart', title: 'Datos para decidir', text: 'Qué te genera Resuelve: apariciones, visitas y resultados.' },
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
 * Resuelve PRO, para vender sin mentir: primero el valor (hero, tres
 * beneficios, un ejemplo rotulado de Tu mes y cómo se vería TU perfil
 * destacado), después la comparación y el precio real de GET /plans.
 * Sin billing: "Quiero PRO" registra el pedido (POST /pro/plan/interest) y
 * PRO se activa a mano; nunca se simula una contratación.
 */
@Component({
  selector: 'app-pro-plans-page',
  imports: [RouterLink, Avatar, Dialog, Icon, ProBadge, FeaturedLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-plans-page.html',
})
export class ProPlansPage {
  protected readonly store = inject(ProStore);
  private readonly plans = inject(PlansStore);

  /** `?quiero=1` (desde "Pasarme a PRO"): abre el pedido al entrar. */
  readonly quiero = input<string | undefined>();

  protected readonly info = this.plans.info;
  protected readonly pillars = PILLARS;
  protected readonly example = EXAMPLE_MONTH;

  /** null mientras se carga /pro/me: no se afirma ningún plan. */
  protected readonly isPro = this.store.hasPro;
  protected readonly proUntil = computed(() => {
    const iso = this.store.plan()?.expiresAt;
    return iso ? longDate(iso, true) : null;
  });
  /** "$19.000" (null hasta que responde /plans: nunca un precio escrito a mano). */
  protected readonly price = computed(() => {
    const ars = this.info()?.pro.monthlyPriceArs;
    return ars ? proPriceAmount(ars) : null;
  });
  protected readonly freeLimit = computed(() => this.info()?.free.monthlyQuoteLimit ?? null);
  /** Un segmento por presupuesto de Free (hasta 20; con más, sin dibujo). */
  protected readonly freeSegments = computed(() => {
    const l = this.freeLimit();
    return l && l <= 20 ? Array.from({ length: l }, (_, i) => i) : [];
  });
  protected readonly freeQuotes = computed(() => {
    const limit = this.freeLimit();
    return limit ? `${limit} presupuestos por mes` : 'Presupuestos sin límite';
  });
  /** Uso real del mes para quien está en Free ("7 de 10"). */
  protected readonly usage = computed(() => {
    const u = this.store.ownProfile()?.quoteUsage;
    return u && this.isPro() === false ? quoteUsageNotice(u).counter : null;
  });
  /** Cuarto beneficio solo si la herramienta existe (flag real del backend). */
  protected readonly templatesReady = computed(() => !!this.info()?.pro.features.quoteTemplates);

  /** Pedido "Quiero PRO" ya registrado (fecha real del backend). */
  protected readonly requestedOn = computed(() => {
    const iso = this.store.ownProfile()?.proInterestAt;
    return iso ? longDate(iso) : null;
  });

  // ---- Tu perfil, como se vería en un espacio destacado ----------------------
  protected readonly me = computed(() => this.store.ownProfile());
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
    return p.yearsExperience ? `${what} · ${p.yearsExperience} ${p.yearsExperience === 1 ? 'año' : 'años'}` : what;
  });
  protected readonly meZones = computed(() => {
    const p = this.me();
    return p ? coverageText(p) : '';
  });

  protected readonly freeItems = computed(() => [
    'Perfil profesional',
    'Solicitudes sin límite',
    this.freeQuotes(),
    'Agenda',
    'Reseñas',
    'Tu mes básico',
  ]);
  protected readonly proItems = [
    'Presupuestos sin límite',
    'Perfil PRO',
    'Espacios destacados',
    'Métricas de exposición',
    'Embudo de oportunidades',
    'Análisis por servicio y barrio',
    'Tu mes completo',
  ];

  protected readonly groups = computed<CompareGroup[]>(() => {
    const limit = this.freeLimit();
    return [
      {
        title: 'Trabajar con Resuelve',
        rows: [
          { label: 'Solicitudes', free: 'Sin límite', pro: 'Sin límite' },
          { label: 'Presupuestos', free: limit ? `${limit} / mes` : 'Sin límite', pro: 'Sin límite' },
          { label: 'Agenda', free: true, pro: true },
          { label: 'Reseñas', free: true, pro: true },
          { label: 'Tu mes', free: 'Básico', pro: 'Completo' },
        ],
      },
      {
        title: 'Crecer en Resuelve',
        rows: [
          { label: 'Perfil PRO', free: false, pro: true },
          { label: 'Espacios destacados', free: false, pro: true },
          { label: 'Apariciones y visitas', free: false, pro: true },
          { label: 'Embudo de oportunidades', free: false, pro: true },
          { label: 'Por servicio y barrio', free: false, pro: true },
        ],
      },
    ];
  });

  // ---- "Quiero PRO" (sin billing) -------------------------------------------
  protected readonly wantOpen = signal(false);
  /** Se registró en esta apertura del diálogo (muestra la confirmación). */
  protected readonly justRequested = signal(false);

  constructor() {
    this.plans.load();
    effect(() => {
      if (this.quiero() && this.isPro() === false) untracked(() => this.wantOpen.set(true));
    });
  }

  protected openWant(): void {
    this.justRequested.set(false);
    this.wantOpen.set(true);
  }

  protected async register(): Promise<void> {
    if (await this.store.requestPro()) this.justRequested.set(true);
  }
}
