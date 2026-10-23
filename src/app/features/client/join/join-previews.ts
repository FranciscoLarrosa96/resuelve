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
    <div role="group" [attr.aria-label]="label()" class="inline-flex w-full gap-1 rounded-full bg-sand p-1 sm:w-auto">
      @for (option of options(); track option.plan) {
        <button
          type="button"
          class="min-h-11 flex-1 rounded-full px-5 text-[15px] font-bold transition-colors motion-reduce:transition-none sm:flex-none sm:px-6"
          [class]="plan() === option.plan ? 'bg-primary text-on-primary' : 'text-ink-soft hover:text-ink'"
          [attr.aria-pressed]="plan() === option.plan"
          (click)="plan.set(option.plan); picked.emit()"
        >
          {{ option.text }}
        </button>
      }
    </div>
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
      class="overflow-hidden rounded-[28px] border-2 bg-surface shadow-soft transition-colors duration-300 motion-reduce:transition-none"
      [class]="pro() ? 'border-brand' : 'border-line-soft'"
      [attr.aria-label]="pro() ? 'Ejemplo de perfil con PRO' : 'Ejemplo de perfil con Gratis'"
      data-testid="join-profile-preview"
    >
      <div class="relative h-16 bg-sand transition-[height] duration-300 motion-reduce:transition-none" [class.h-28]="pro()">
        @if (pro()) {
          <img [src]="cover" alt="" width="720" height="240" class="preview-in absolute inset-0 size-full object-cover" />
          <span class="absolute right-2 bottom-2 rounded bg-inverse/70 px-1.5 py-0.5 text-[11px] font-semibold text-on-inverse">Tu portada</span>
        }
      </div>
      <div class="relative -mt-9 px-5">
        <span class="grid size-[72px] place-items-center rounded-full border-4 border-surface bg-brand-tint font-display text-[24px] font-bold text-brand" aria-hidden="true">TU</span>
      </div>
      <div class="px-5 pt-2 pb-4">
        <p class="flex flex-wrap items-center gap-2"><span class="text-[19px] font-bold">Tu nombre</span>@if (pro()) { <app-pro-badge /> }</p>
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
          @if (pro()) { <span class="text-[12px] font-normal text-muted">Hasta {{ works }}, {{ photos }} fotos cada uno</span> }
        </p>
        @if (pro()) {
          <ul class="preview-in mt-2.5 grid grid-cols-2 gap-2" data-testid="join-preview-works">
            @for (w of demoWorks; track w.src) {
              <li class="relative h-24 overflow-hidden rounded-lg bg-sand">
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
    </figure>
  `,
  styles: `
    .preview-in { animation: preview-in 260ms cubic-bezier(0.22, 1, 0.36, 1); }
    @keyframes preview-in { from { opacity: 0; transform: translateY(6px); } }
    @media (prefers-reduced-motion: reduce) { .preview-in { animation: none; } }
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
                <p class="flex flex-wrap items-center gap-1.5"><span class="text-[15px] font-bold">{{ r.name }}</span>@if (r.pro) { <app-pro-badge /> }</p>
                <p class="text-[13px] text-muted">Tu oficio · Sus reseñas</p>
              </div>
              @if (r.you) { <span class="shrink-0 rounded-full border-[1.5px] border-accent-strong px-2 py-0.5 text-[11px] font-bold tracking-wider text-accent-ink">VOS</span> }
            </div>
            @if (r.photos.length) {
              <div class="preview-in mt-2.5 grid grid-cols-3 gap-1.5">
                @for (src of r.photos; track src) {
                  <img [src]="src" alt="" width="200" height="140" loading="lazy" class="h-16 w-full rounded-lg bg-sand object-cover" />
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
    .preview-in { animation: preview-in 260ms cubic-bezier(0.22, 1, 0.36, 1); }
    @keyframes preview-in { from { opacity: 0; transform: translateY(6px); } }
    @media (prefers-reduced-motion: reduce) { .preview-in { animation: none; } }
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
