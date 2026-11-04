import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { PHOTOS_PER_WORK, PRO_WORK_LIMIT } from '../../../core/state/work-photos.store';
import { Icon } from '../../../shared/components/icon/icon';
import { FeaturedLabel, ProBadge } from '../../../shared/components/plan-badges/plan-badges';

export type PreviewPlan = 'FREE' | 'PRO';

/** Fotos de muestra (`public/portfolio-demo/`, las mismas del editor de trabajos): nunca de un profesional real. */
const demo = (name: string) => `/portfolio-demo/${name}.webp`;

/**
 * Interruptor Gratis / PRO de las vistas previas de "Trabajá con Resuelve".
 * Solo cambia lo que se muestra: no elige ni contrata un plan.
 */
@Component({
  selector: 'app-join-plan-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div role="group" [attr.aria-label]="label()" class="relative grid w-full grid-cols-2 gap-1 rounded-full bg-sand p-1 sm:inline-grid sm:w-auto">
      <!-- La pastilla se desliza (con un leve rebote) en vez de saltar de un botón al otro. -->
      <span class="jp-thumb" [class.jp-thumb-pro]="plan() === 'PRO'" aria-hidden="true"></span>
      @for (option of options(); track option.plan) {
        <button
          type="button"
          class="relative min-h-11 rounded-full px-5 text-[15px] font-bold transition-colors duration-300 motion-reduce:transition-none sm:px-6"
          [class]="plan() === option.plan ? 'text-on-primary' : 'text-ink-soft hover:text-ink'"
          [attr.aria-pressed]="plan() === option.plan"
          (click)="plan.set(option.plan); picked.emit()"
        >
          {{ option.text }}
        </button>
      }
    </div>
  `,
  styles: `
    .jp-thumb {
      position: absolute;
      top: 4px;
      bottom: 4px;
      left: 4px;
      width: calc(50% - 6px);
      border-radius: 9999px;
      background: var(--color-primary);
      transition: transform 420ms cubic-bezier(0.34, 1.36, 0.5, 1);
    }
    .jp-thumb-pro {
      transform: translateX(calc(100% + 4px));
    }
    @media (prefers-reduced-motion: reduce) {
      .jp-thumb {
        transition: none;
      }
    }
  `,
})
export class JoinPlanToggle {
  readonly plan = model.required<PreviewPlan>();
  readonly label = input.required<string>();
  readonly freeText = input('Gratis');
  readonly proText = input('PRO');
  /** La persona tocó el interruptor (aunque elija lo que ya estaba). */
  readonly picked = output<void>();
  protected readonly options = computed(() => [
    { plan: 'FREE' as const, text: this.freeText() },
    { plan: 'PRO' as const, text: this.proText() },
  ]);
}

/** Perfil público ilustrativo ("Tu nombre"): con PRO suma portada, sello y trabajos con fotos. */
@Component({
  selector: 'app-join-profile-preview',
  imports: [Icon, ProBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure
      class="relative overflow-hidden rounded-[28px] border-2 bg-surface shadow-soft transition-colors duration-300 motion-reduce:transition-none"
      [class]="pro() ? 'border-brand' : 'border-line-soft'"
      [attr.aria-label]="pro() ? 'Ejemplo de perfil con PRO' : 'Ejemplo de perfil con Gratis'"
      data-testid="join-profile-preview"
    >
      <div class="relative h-16 bg-sand transition-[height] duration-300 motion-reduce:transition-none" [class.h-28]="pro()">
        @if (pro()) {
          <img [src]="cover" alt="" width="720" height="240" class="jp-cover absolute inset-0 size-full object-cover" />
          <span class="jp-fade absolute right-2 bottom-2 rounded bg-inverse/70 px-1.5 py-0.5 text-[11px] font-semibold text-on-inverse" style="--d: 0.45s">Tu portada</span>
        }
      </div>
      <div class="relative -mt-9 px-5">
        <span class="grid size-[72px] place-items-center rounded-full border-4 border-surface bg-brand-tint font-display text-[24px] font-bold text-brand" aria-hidden="true">TU</span>
      </div>
      <div class="px-5 pt-2 pb-4">
        <p class="flex flex-wrap items-center gap-2"><span class="text-[19px] font-bold">Tu nombre</span>@if (pro()) { <app-pro-badge class="jp-stamp" style="--d: 0.3s" /> }</p>
        <p class="mt-0.5 text-[14px] text-muted">Tu oficio · Tu localidad</p>
        <p class="mt-1.5 inline-flex items-center gap-1 text-[14px] text-muted"><app-icon name="star" [size]="14" class="text-accent" />Tus reseñas</p>
      </div>
      <div class="grid grid-cols-2 gap-2 px-5" aria-hidden="true">
        <span class="grid h-10 place-items-center rounded-lg border border-brand-line text-[13px] font-semibold text-brand">WhatsApp</span>
        <span class="grid h-10 place-items-center rounded-lg border border-brand-line text-[13px] font-semibold text-brand">Llamar</span>
        <span class="col-span-2 grid h-10 place-items-center rounded-lg bg-primary text-[13px] font-semibold text-on-primary">Pedir presupuesto</span>
      </div>
      <figcaption class="px-5 pt-5 pb-6">
        <p class="flex items-baseline justify-between gap-2 text-[14px] font-bold">
          Trabajos realizados
          @if (pro()) { <span class="jp-fade text-[12px] font-normal text-muted" style="--d: 0.5s">Hasta {{ works }}, {{ photos }} fotos cada uno</span> }
        </p>
        @if (pro()) {
          <ul class="mt-2.5 grid grid-cols-2 gap-2" data-testid="join-preview-works">
            @for (w of demoWorks; track w.src; let i = $index) {
              <li class="jp-rise relative h-24 overflow-hidden rounded-lg bg-sand" [style.--d]="0.55 + i * 0.1 + 's'">
                <img [src]="w.src" alt="" width="320" height="240" loading="lazy" class="size-full object-cover" />
                <span class="absolute bottom-1 left-1 rounded bg-inverse/70 px-1.5 py-0.5 text-[11px] font-semibold text-on-inverse">{{ w.title }}</span>
              </li>
            }
          </ul>
        } @else {
          <p class="preview-in mt-2.5 flex h-[200px] flex-col items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-line-dash text-[14px] text-muted" data-testid="join-preview-empty">
            <app-icon name="camera" [size]="26" />Sin trabajos publicados
          </p>
        }
      </figcaption>
      @if (pro()) {
        <!-- Un brillo que cruza la tarjeta una vez, al terminar de armarse. -->
        <span class="jp-sheen" style="--d: 0.95s" aria-hidden="true"></span>
      }
    </figure>
  `,
  styles: `
    /*
     * Gratis → PRO, en orden: la portada se revela, el sello se estampa, los
     * trabajos entran en cascada y un brillo cruza la tarjeta. Una vez por cambio,
     * sin bucles; volver a Gratis es rápido y sin espectáculo.
     */
    .preview-in { animation: preview-in 220ms cubic-bezier(0.22, 1, 0.36, 1); }
    .jp-cover { animation: jp-reveal 700ms cubic-bezier(0.65, 0, 0.35, 1) both; }
    .jp-stamp { display: inline-flex; animation: jp-stamp 460ms cubic-bezier(0.34, 1.5, 0.5, 1) var(--d) both; }
    .jp-fade { animation: jp-fade 360ms ease-out var(--d) both; }
    .jp-rise { animation: jp-rise 480ms cubic-bezier(0.16, 1, 0.3, 1) var(--d) both; }
    .jp-sheen {
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: linear-gradient(105deg, transparent 35%, color-mix(in srgb, var(--color-surface) 55%, transparent) 50%, transparent 65%);
      transform: translateX(-100%);
      animation: jp-sheen 900ms cubic-bezier(0.45, 0, 0.25, 1) var(--d) both;
    }
    @keyframes preview-in { from { opacity: 0; transform: translateY(6px); } }
    @keyframes jp-reveal { from { clip-path: inset(0 100% 0 0); transform: scale(1.06); } to { clip-path: inset(0); transform: none; } }
    @keyframes jp-stamp { from { opacity: 0; transform: scale(1.8) rotate(-8deg); } to { opacity: 1; transform: none; } }
    @keyframes jp-fade { from { opacity: 0; } }
    @keyframes jp-rise { from { opacity: 0; transform: translateY(14px) scale(0.94); } }
    @keyframes jp-sheen { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
    @media (prefers-reduced-motion: reduce) {
      .preview-in, .jp-cover, .jp-stamp, .jp-fade, .jp-rise { animation: none; }
      .jp-sheen { display: none; }
    }
  `,
})
export class JoinProfilePreview {
  readonly plan = input.required<PreviewPlan>();
  protected readonly pro = computed(() => this.plan() === 'PRO');
  protected readonly cover = demo('bano-1');
  protected readonly works = PRO_WORK_LIMIT;
  protected readonly photos = PHOTOS_PER_WORK;
  protected readonly demoWorks = [
    { title: 'Ejemplo: cocina', src: demo('cocina-1') },
    { title: 'Ejemplo: tablero', src: demo('electrica-1') },
    { title: 'Ejemplo: ducha', src: demo('ducha-1') },
    { title: 'Ejemplo: pintura', src: demo('pintura-1') },
  ];
}

interface PreviewResult {
  id: string;
  name: string;
  initials: string;
  you: boolean;
  pro: boolean;
  featured: boolean;
  photos: string[];
}

/** Resultados de búsqueda como los ve el cliente: tu tarjeta ("Vos") entre otras dos, todas ilustrativas. */
@Component({
  selector: 'app-join-search-preview',
  imports: [Icon, ProBadge, FeaturedLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="rounded-2xl border border-line-soft bg-canvas p-4" aria-label="Ejemplo de resultados de búsqueda" data-testid="join-search-preview">
      <p class="flex items-center gap-2 rounded-xl border border-line-soft bg-surface px-3.5 py-3 text-[14px] text-ink-soft" aria-hidden="true">
        <app-icon name="search" [size]="16" />Tu oficio en tu localidad
      </p>
      <ul class="mt-3 grid gap-2.5">
        @for (r of results(); track r.id) {
          <li class="rounded-xl bg-surface p-3.5" [class]="r.you ? 'border-2 border-accent-strong' : 'border border-line-soft'" [attr.data-testid]="r.you ? 'join-search-you' : null">
            @if (r.featured) { <app-featured-label class="mb-1.5" /> }
            <div class="flex items-center gap-3">
              <span class="grid size-11 shrink-0 place-items-center rounded-full bg-brand-tint font-display text-[15px] font-bold text-brand" aria-hidden="true">{{ r.initials }}</span>
              <div class="min-w-0 flex-1">
                <p class="flex flex-wrap items-center gap-1.5"><span class="text-[15px] font-bold">{{ r.name }}</span>@if (r.pro) { <app-pro-badge [class.jp-stamp]="r.you" /> }</p>
                <p class="text-[13px] text-muted">Tu oficio · Sus reseñas</p>
              </div>
              @if (r.you) { <span class="shrink-0 rounded-full border-[1.5px] border-accent-strong px-2 py-0.5 text-[11px] font-bold tracking-wider text-accent-ink">VOS</span> }
            </div>
            @if (r.photos.length) {
              <div class="mt-2.5 grid grid-cols-3 gap-1.5" [class.jp-strip]="r.you">
                @for (src of r.photos; track src; let i = $index) {
                  <img [src]="src" alt="" width="200" height="140" loading="lazy" class="h-16 w-full rounded-lg bg-sand object-cover" [style.--i]="i" />
                }
              </div>
            }
          </li>
        }
      </ul>
      <figcaption class="mt-3 text-[12.5px] text-muted">Ejemplo ilustrativo. PRO no garantiza posición ni clientes.</figcaption>
    </figure>
  `,
  styles: `
    /* Tu tarjeta con PRO: el sello se estampa y la tira de fotos se despliega, una foto tras otra. */
    .jp-stamp { display: inline-flex; animation: jp-stamp 460ms cubic-bezier(0.34, 1.5, 0.5, 1) both; }
    .jp-strip { animation: jp-open 420ms cubic-bezier(0.16, 1, 0.3, 1) both; overflow: hidden; }
    .jp-strip img { animation: jp-rise 460ms cubic-bezier(0.16, 1, 0.3, 1) calc(0.18s + var(--i) * 0.09s) both; }
    @keyframes jp-stamp { from { opacity: 0; transform: scale(1.8) rotate(-8deg); } to { opacity: 1; transform: none; } }
    @keyframes jp-open { from { max-height: 0; margin-top: 0; } to { max-height: 64px; } }
    @keyframes jp-rise { from { opacity: 0; transform: translateY(10px) scale(0.94); } }
    @media (prefers-reduced-motion: reduce) { .jp-stamp, .jp-strip, .jp-strip img { animation: none; } }
  `,
})
export class JoinSearchPreview {
  readonly plan = input.required<PreviewPlan>();
  protected readonly results = computed<PreviewResult[]>(() => {
    const pro = this.plan() === 'PRO';
    return [
      { id: 'other-pro', name: 'Otro profesional', initials: 'OP', you: false, pro: true, featured: true, photos: [demo('pintura-2'), demo('cocina-2'), demo('electrica-2')] },
      { id: 'you', name: 'Tu nombre', initials: 'TU', you: true, pro, featured: false, photos: pro ? [demo('bano-4'), demo('ducha-2'), demo('cocina-3')] : [] },
      { id: 'other-free', name: 'Otro profesional', initials: 'OP', you: false, pro: false, featured: false, photos: [] },
    ];
  });
}
