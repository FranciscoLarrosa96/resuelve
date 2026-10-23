import { NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProAnalyticsApiService } from '../../../core/api/pro-analytics-api.service';
import { PlansInfo } from '../../../core/models/pro-analytics';
import { AuthStore } from '../../../core/state/auth.store';
import { PHOTOS_PER_WORK, PRO_WORK_LIMIT } from '../../../core/state/work-photos.store';
import { formatMoney } from '../../../core/utils/format';
import { FREE_DIRECT_REQUESTS, PRO_EARLY_ACCESS } from '../../../core/utils/pro-benefits';
import { Icon } from '../../../shared/components/icon/icon';
import { JoinPlanToggle, JoinProfilePreview, JoinSearchPreview, PreviewPlan } from './join-previews';

interface CompareRow {
  label: string;
  free: string | boolean;
  pro: string | boolean;
}

/** Espera antes del cambio automático a PRO, con la vista previa ya en pantalla. */
export const AUTO_PRO_DELAY_MS = 1200;

/**
 * "Trabajá con Resuelve": la página para profesionales ANTES de crear la cuenta.
 * Poco texto y la diferencia Gratis / PRO a la vista: un perfil y unos resultados
 * de búsqueda ilustrativos (rotulados "Ejemplo", fotos de `public/portfolio-demo/`)
 * con un interruptor. Solo lo que el producto hace hoy (sin testimonios, cifras ni
 * promesas de clientes, posición o ingresos). El precio y el cupo Free salen de
 * GET /plans (única fuente); sin respuesta, la página no inventa un número.
 */
@Component({
  selector: 'app-join-page',
  imports: [RouterLink, NgTemplateOutlet, Icon, JoinPlanToggle, JoinProfilePreview, JoinSearchPreview],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-6xl px-4 pt-8 md:px-8 md:pt-14">
      <section class="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,380px)] lg:items-center lg:gap-16" aria-labelledby="join-title">
        <div class="min-w-0">
          <p class="text-sm font-semibold tracking-[0.14em] text-brand uppercase">Para profesionales y oficios</p>
          <h1 id="join-title" class="mt-3 font-display text-[40px] leading-[1.05] font-bold tracking-[-0.02em] text-balance text-ink md:text-[56px]">
            Tu perfil, listo para que te elijan.
          </h1>
          <p class="mt-4 text-[18px] leading-relaxed text-ink-soft"><b class="font-bold text-brand">Empezá gratis.</b> Tocá PRO y mirá cómo cambia.</p>

          <app-join-plan-toggle class="mt-7 block" label="Ver tu perfil con cada plan" [(plan)]="plan" (picked)="touched = true" />

          <ul class="mt-5 max-w-md" data-testid="join-hero-benefits">
            @for (b of heroBenefits(); track b.text) {
              <li class="flex items-center gap-3.5 border-t border-line-soft py-3">
                <span class="grid size-9 shrink-0 place-items-center rounded-[10px]" [class]="b.on ? 'bg-brand-tint text-brand' : 'bg-sand text-muted'" aria-hidden="true">
                  <app-icon [name]="b.on ? 'check' : 'lock'" [size]="17" [stroke]="b.on ? 2.4 : 2" />
                </span>
                <span class="text-[16px]" [class]="b.on ? 'font-bold text-ink' : 'font-semibold text-muted line-through'">{{ b.text }}</span>
                @if (!b.on) { <span class="sr-only">(con PRO)</span> }
              </li>
            }
          </ul>

          <div class="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a [routerLink]="startLink()" class="button-primary inline-flex min-h-13 items-center justify-center gap-2 rounded-xl px-7 text-[16px] font-semibold" data-testid="join-cta">
              Crear mi perfil gratis<app-icon name="arrow-right" [size]="16" [stroke]="2.4" />
            </a>
            <a routerLink="/trabaja-con-resuelve" fragment="planes" class="inline-flex min-h-13 items-center justify-center rounded-xl px-5 text-[16px] font-semibold text-brand hover:bg-brand-tint">
              Ver planes
            </a>
          </div>
          @if (!auth.authenticated()) {
            <p class="mt-4 text-[14px] text-muted">
              ¿Ya tenés cuenta? <a routerLink="/ingresar" [queryParams]="{ returnUrl: '/soy-profesional' }" class="font-semibold text-brand underline underline-offset-2">Ingresá</a> y sumá tu perfil profesional.
            </p>
          }
        </div>

        <div #heroPreview class="mx-auto w-full max-w-[380px]">
          <app-join-profile-preview [plan]="plan()" />
          <p class="mt-2 text-center text-[13px] text-muted">Ejemplo ilustrativo</p>
        </div>
      </section>
    </div>

    <section class="mt-20 border-y border-line-soft bg-surface" aria-labelledby="search-title">
      <div class="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:items-center lg:gap-14">
        <div class="min-w-0">
          <h2 id="search-title" class="font-display text-[32px] leading-[1.08] font-bold tracking-[-0.02em] text-balance md:text-[44px]">
            Un vecino busca en tu zona. ¿A quién le escribe?
          </h2>
          <p class="mt-4 max-w-md text-[17px] leading-relaxed text-ink-soft"><b class="font-bold text-brand">Con PRO, las fotos de tus trabajos se ven</b> antes de que entren a tu perfil.</p>
          <app-join-plan-toggle class="mt-6 block" label="Ver tu tarjeta con cada plan" freeText="Vos con Gratis" proText="Vos con PRO" [(plan)]="plan" (picked)="touched = true" />
        </div>
        <app-join-search-preview class="block min-w-0" [plan]="plan()" />
      </div>
    </section>

    <div class="mx-auto max-w-6xl px-4 pb-24 md:px-8 md:pb-20">
      <section id="planes" class="mx-auto mt-20 max-w-3xl scroll-mt-24" aria-labelledby="plans-title" data-testid="join-plans">
        <h2 id="plans-title" class="text-center font-display text-[32px] leading-tight font-bold tracking-[-0.02em] md:text-[40px]">Gratis vs PRO</h2>

        <div class="mt-7 overflow-hidden rounded-2xl border border-line-soft bg-surface">
          <table class="w-full text-left text-[15px]" data-testid="join-compare">
            <caption class="sr-only">Qué incluye cada plan</caption>
            <thead class="bg-sand text-[14px]">
              <tr><th scope="col" class="px-4 py-3 md:px-5"><span class="sr-only">Prestación</span></th><th scope="col" class="w-24 px-2 py-3 text-center md:w-36">Gratis</th><th scope="col" class="w-24 px-2 py-3 text-center text-brand md:w-36">PRO</th></tr>
            </thead>
            <tbody>
              @for (row of mainRows(); track row.label) {
                <ng-container *ngTemplateOutlet="rowTpl; context: { $implicit: row }" />
              }
            </tbody>
          </table>
          <details class="group border-t border-line-soft">
            <summary class="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-[15px] font-bold text-brand md:px-5 [&::-webkit-details-marker]:hidden">
              Ver todas las diferencias<app-icon name="chevron-down" [size]="18" class="shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
            </summary>
            <table class="w-full text-left text-[15px]">
              <caption class="sr-only">Más diferencias entre planes</caption>
              <tbody>
                @for (row of moreRows; track row.label) {
                  <ng-container *ngTemplateOutlet="rowTpl; context: { $implicit: row }" />
                }
              </tbody>
            </table>
          </details>
        </div>
        <p class="mt-3 text-[13px] leading-relaxed text-muted" data-testid="plan-access-rules">{{ earlyAccess }} {{ directRequests }}</p>

        <div class="mt-8 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <article class="flex flex-col gap-3 rounded-2xl border border-line-soft bg-surface p-6">
            <h3 class="text-[18px] font-bold">Gratis</h3>
            <p class="text-[40px] leading-none font-bold">$0</p>
            <p class="text-[15px] text-muted">Para arrancar hoy y conseguir tu primer cliente.</p>
            <a [routerLink]="startLink()" class="button-primary mt-auto inline-flex min-h-12 items-center justify-center self-start rounded-xl px-5 text-[15px] font-semibold">Crear mi perfil gratis</a>
          </article>
          <article class="flex flex-col gap-3 rounded-2xl border-2 border-brand bg-brand-tint p-6" data-testid="join-pro-card">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h3 class="text-[18px] font-bold text-brand">PRO</h3>
              @if (founder(); as f) { <span class="rounded-full bg-accent-fill px-2.5 py-1 text-[12px] font-bold text-on-primary" data-testid="join-founder">Precio fundador</span> }
            </div>
            @if (price(); as p) {
              <p class="text-[40px] leading-none font-bold tabular-nums">{{ p }} <span class="text-[15px] font-normal text-muted">/ mes</span></p>
            }
            @if (founder(); as f) {
              <p class="flex gap-2.5 rounded-xl border border-accent-line bg-accent-soft px-4 py-3 text-[15px] leading-relaxed text-accent-ink" data-testid="join-founder-promo">
                <app-icon name="shield" [size]="18" class="mt-0.5 shrink-0" />
                <span>Los primeros {{ f.slots }} profesionales que contratan PRO <b class="font-bold">mantienen {{ money(f.priceArs) }}/mes</b> aunque el precio suba.</span>
              </p>
            } @else {
              <p class="text-[15px] text-ink-soft">Para que más clientes te encuentren y te elijan.</p>
            }
            <p class="mt-auto pt-2 text-[14px] font-semibold text-brand">Lo activás desde Mi plan cuando quieras.</p>
          </article>
        </div>
        <p class="mt-4 flex items-center justify-center gap-2 text-center text-[15px] text-ink-soft">
          <app-icon name="check-circle" [size]="18" class="shrink-0 text-brand" />
          <span>El trabajo lo cobrás vos, directo con el cliente. <b class="font-bold text-brand">Resuelve no cobra comisión.</b></span>
        </p>
      </section>

      <section class="mx-auto mt-20 max-w-3xl" aria-labelledby="faq-title">
        <h2 id="faq-title" class="font-display text-[32px] leading-tight font-bold tracking-[-0.02em] md:text-[40px]">Preguntas frecuentes</h2>
        <div class="mt-6 divide-y divide-line border-y border-line">
          @for (q of faq(); track q.q) {
            <details class="group py-1">
              <summary class="flex min-h-14 cursor-pointer items-center justify-between gap-4 text-[17px] font-semibold">
                {{ q.q }}<app-icon name="chevron-down" [size]="18" class="shrink-0 text-muted transition-transform group-open:rotate-180" />
              </summary>
              <p class="pb-4 text-[15.5px] leading-relaxed text-ink-soft">{{ q.a }}</p>
            </details>
          }
        </div>
      </section>

      <section class="mt-20 flex flex-col gap-6 rounded-3xl bg-primary px-6 py-10 text-on-primary md:flex-row md:items-center md:justify-between md:px-12 md:py-12" aria-labelledby="join-final-title">
        <h2 id="join-final-title" class="font-display text-[30px] leading-tight font-bold md:text-[38px]">Tu perfil, listo en unos minutos.</h2>
        <a [routerLink]="startLink()" class="inline-flex min-h-13 shrink-0 items-center gap-2 self-start rounded-xl bg-surface px-7 text-[16px] font-semibold text-brand-dark hover:bg-canvas md:self-auto">
          Crear mi perfil gratis<app-icon name="arrow-right" [size]="16" [stroke]="2.4" />
        </a>
      </section>
    </div>

    <!-- Celular: el alta siempre a mano. -->
    <div class="sticky bottom-0 z-10 border-t border-line-soft bg-surface px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] md:hidden">
      <a [routerLink]="startLink()" class="button-primary flex min-h-12 items-center justify-center rounded-xl text-[15px] font-semibold">Crear mi perfil gratis</a>
    </div>

    <ng-template #rowTpl let-row>
      <tr class="border-t border-line-soft">
        <th scope="row" class="px-4 py-3.5 font-normal md:px-5">{{ row.label }}</th>
        @for (value of [row.free, row.pro]; track $index) {
          <td class="px-2 py-3.5 text-center">
            @if (value === true) {
              <app-icon name="check" [size]="18" [stroke]="2.6" class="inline-block text-brand" /><span class="sr-only">Incluido</span>
            } @else if (value === false) {
              <span class="text-dot-muted" aria-hidden="true">—</span><span class="sr-only">No incluido</span>
            } @else {
              <span class="text-[14px]" [class]="$index === 1 ? 'font-bold text-brand' : 'text-ink-soft'">{{ value }}</span>
            }
          </td>
        }
      </tr>
    </ng-template>
  `,
})
export class JoinPage {
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(ProAnalyticsApiService);
  private readonly heroPreview = viewChild<ElementRef<HTMLElement>>('heroPreview');
  protected readonly plans = signal<PlansInfo | null>(null);
  /**
   * Qué muestran las vistas previas. Arranca en Gratis y, en el navegador, pasa una
   * sola vez a PRO al verse el perfil; con movimiento reducido o sin
   * IntersectionObserver, directo a PRO. Si la persona ya tocó el interruptor, no se toca.
   */
  protected readonly plan = signal<PreviewPlan>('FREE');
  protected touched = false;

  protected readonly price = computed(() => {
    const p = this.plans()?.pro.monthlyPriceArs;
    return p ? formatMoney(p) : null;
  });
  /** Precio fundador sin contador de lugares: solo si quedan lugares reales. */
  protected readonly founder = computed(() => {
    const f = this.plans()?.founder;
    return f && f.slots > 0 && f.remaining > 0 ? f : null;
  });
  protected readonly money = formatMoney;
  /** Invitado: crear cuenta para profesionales. Con sesión: el alta directo. */
  protected readonly startLink = computed(() => (this.auth.authenticated() ? '/soy-profesional' : '/registro/profesional'));

  protected readonly heroBenefits = computed(() => {
    const pro = this.plan() === 'PRO';
    return [
      { text: 'WhatsApp, llamadas y reseñas', on: true },
      { text: 'Portada y sello PRO', on: pro },
      { text: `Hasta ${PRO_WORK_LIMIT} trabajos con ${PHOTOS_PER_WORK} fotos`, on: pro },
      { text: 'Tus fotos en la búsqueda', on: pro },
    ];
  });

  protected readonly mainRows = computed<CompareRow[]>(() => {
    const limit = this.plans()?.free.quoteLimit;
    return [
      { label: 'Perfil, WhatsApp, llamadas y reseñas', free: true, pro: true },
      { label: 'Trabajos con fotos en tu perfil', free: false, pro: `${PRO_WORK_LIMIT} × ${PHOTOS_PER_WORK} fotos` },
      { label: 'Fotos y Destacados en la búsqueda', free: false, pro: true },
      { label: 'Estadísticas', free: 'Totales', pro: 'Completas' },
      {
        label: 'Responder pedidos de búsqueda',
        free: limit === undefined ? 'Con cupo' : limit === null ? 'Sin límite' : `${limit} en total`,
        pro: 'Sin límite',
      },
    ];
  });
  protected readonly moreRows: CompareRow[] = [
    { label: 'Agenda y solicitudes por Resuelve', free: true, pro: true },
    { label: 'Llegás antes que Free con espera', free: false, pro: true },
    { label: 'Presupuestos en PDF', free: false, pro: true },
    { label: 'Tu mes en CSV y resumen semanal', free: false, pro: true },
  ];
  protected readonly earlyAccess = PRO_EARLY_ACCESS;
  protected readonly directRequests = FREE_DIRECT_REQUESTS;

  /** El cupo y el precio salen de GET /plans: el cupo de Free se dice antes de crear la cuenta, no al agotarlo. */
  protected readonly faq = computed(() => [{ q: '¿Cuánto cuesta?', a: this.costAnswer() }, ...this.otherFaq]);

  protected readonly costAnswer = computed(() => {
    const limit = this.plans()?.free.quoteLimit;
    const price = this.price();
    const free =
      limit == null
        ? 'Crear tu perfil y usar Resuelve Free es gratis.'
        : `Crear tu perfil y usar Resuelve Free es gratis: te llegan solicitudes y te contactan por WhatsApp o llamadas. Con presupuesto podés responder ${limit === 1 ? '1 pedido' : `${limit} pedidos`} de búsqueda en total: no se renueva cada mes, y los pedidos que te hacen a vos directamente no cuentan.`;
    const pro = price
      ? `PRO es opcional: ${price} por mes, respondés sin ese límite y lo cancelás cuando quieras.`
      : 'PRO es opcional: se paga por mes, respondés sin ese límite y lo cancelás cuando quieras.';
    return `${free} ${pro}`;
  });

  private readonly otherFaq = [
    { q: '¿Resuelve cobra el trabajo o se queda con una parte?', a: 'No. Acordás el precio y lo cobrás vos, directo con el cliente. Resuelve no interviene en ese pago.' },
    { q: '¿Necesito matrícula?', a: 'No para aparecer. En los servicios que la piden podés cargar tu número de matrícula: si la verificamos en el registro oficial, tu perfil muestra «Matrícula verificada».' },
    { q: '¿Se publica mi teléfono?', a: 'Solo si habilitás WhatsApp o llamadas y das tu consentimiento. Si no, el cliente ve tus datos recién cuando elige tu presupuesto.' },
    { q: '¿Puedo pausar mi perfil?', a: 'Sí. Lo pausás desde Mi perfil y no aparecés en búsquedas nuevas hasta que lo reactives.' },
  ];

  constructor() {
    // Precio y cupo reales: solo en el navegador (el HTML prerenderizado no fija un número).
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    this.api.getPlans().subscribe({ next: (p) => this.plans.set(p), error: () => this.plans.set(null) });
    const destroy = inject(DestroyRef);
    afterNextRender(() => this.autoShowPro(destroy));
  }

  /** El cambio a PRO se ve una vez, cuando el perfil de ejemplo entra en pantalla. */
  private autoShowPro(destroy: DestroyRef) {
    const showPro = () => {
      if (!this.touched) this.plan.set('PRO');
    };
    const target = this.heroPreview()?.nativeElement;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (!target || reduced || !('IntersectionObserver' in window)) return showPro();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        timer = setTimeout(showPro, AUTO_PRO_DELAY_MS);
      },
      { threshold: 0.4 },
    );
    observer.observe(target);
    destroy.onDestroy(() => {
      observer.disconnect();
      clearTimeout(timer);
    });
  }
}
