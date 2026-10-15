import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PHOTOS_PER_WORK, PRO_WORK_LIMIT } from '../../../core/state/work-photos.store';
import { Icon } from '../../../shared/components/icon/icon';

/** Trabajo de ejemplo: fotos de muestra en `public/portfolio-demo/` (nunca de un profesional real). */
interface DemoWork {
  id: string;
  title: string;
  description: string;
  month: string;
  /** La primera es la portada. */
  photos: { src: string; alt: string }[];
}

const demo = (name: string, count: number, alts: string[]) =>
  Array.from({ length: count }, (_, i) => ({ src: `/portfolio-demo/${name}-${i + 1}.webp`, alt: alts[i] ?? '' }));

/** Free: un trabajo con sus 5 fotos (la miniatura 6 es la misma escena desde otro ángulo). */
const FREE_DEMO: DemoWork = {
  id: 'bano',
  title: 'Instalación de baño',
  description: 'Colocación de artefactos, grifería y terminaciones.',
  month: 'Marzo 2026',
  photos: demo('bano', 6, [
    'Ejemplo: vanitory con grifería nueva',
    'Ejemplo: desagüe del lavatorio',
    'Ejemplo: mueble de baño terminado',
    'Ejemplo: mampara de ducha',
    'Ejemplo: inodoro instalado',
    'Ejemplo: ducha con flor de lluvia',
  ]).filter((_, i) => i !== 2),
};

/** PRO: varios trabajos de oficios distintos (cuatro bastan para dar la idea, sin recargar). */
const PRO_DEMO: DemoWork[] = [
  {
    id: 'electrica',
    title: 'Instalación eléctrica completa',
    description: 'Tablero, cableado e iluminación.',
    month: 'Agosto 2026',
    photos: demo('electrica', 5, ['Ejemplo: tablero eléctrico armado']),
  },
  {
    id: 'cocina',
    title: 'Renovación de cocina',
    description: 'Muebles, mesada y terminaciones.',
    month: 'Junio 2026',
    photos: demo('cocina', 5, ['Ejemplo: cocina renovada']),
  },
  {
    id: 'ducha',
    title: 'Remodelación de baño',
    description: 'Revestimientos, grifería y mampara.',
    month: 'Abril 2026',
    photos: demo('ducha', 5, ['Ejemplo: ducha con mampara']),
  },
  {
    id: 'pintura',
    title: 'Pintura interior',
    description: 'Paredes, techos y terminaciones.',
    month: 'Enero 2026',
    photos: demo('pintura', 5, ['Ejemplo: pared pintada con rodillo']),
  },
];

/**
 * "Así podría verse tu portfolio": vista previa ILUSTRATIVA de "Trabajos
 * realizados" para quien todavía no creó ningún trabajo (`WorkPhotosStore.works()`
 * vacío, la misma fuente que el editor). Imita las tarjetas reales —portada,
 * miniaturas, nombre, mes y año, cantidad de fotos— pero todo va rotulado
 * "Ejemplo": nunca se mezcla con contenido real ni se publica. Free muestra
 * un trabajo y, aparte y discreto, lo que suma PRO; PRO muestra varios.
 */
@Component({
  selector: 'app-portfolio-preview',
  imports: [Icon, NgTemplateOutlet, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mt-4 animate-fade-in" data-testid="portfolio-preview" [attr.data-plan]="pro() ? 'PRO' : 'FREE'">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div class="min-w-0">
          <p
            class="inline-flex items-center gap-1.5 rounded-full bg-sand px-2.5 py-1 text-[13px] font-semibold text-ink-soft"
            data-testid="portfolio-preview-label"
          >
            <app-icon name="eye" [size]="14" [stroke]="2" />Vista previa ilustrativa
          </p>
          <h3 id="portfolio-preview-title" class="mt-2.5 text-[19px] leading-snug font-bold tracking-[-0.01em] text-ink">
            Así podría verse tu portfolio
          </h3>
          <p class="mt-1 max-w-xl text-[14.5px] leading-relaxed text-ink-soft">
            @if (pro()) {
              Mostrá varios trabajos realizados y organizá tu experiencia para transmitir más confianza.
            } @else {
              Mostrá tu primer trabajo con hasta {{ perWork }} fotos para que tus futuros clientes conozcan lo que hacés.
            }
          </p>
        </div>
        <button
          type="button"
          class="button-primary inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-semibold disabled:opacity-60"
          [disabled]="busy()"
          (click)="create.emit()"
          data-testid="work-create"
        >
          <app-icon name="plus" [size]="17" [stroke]="2.2" />Crear mi primer trabajo
        </button>
      </div>

      <!-- Ejemplos: no son trabajos del profesional, no se publican ni se pueden tocar. -->
      <div class="mt-5" role="group" aria-labelledby="portfolio-preview-title" aria-describedby="portfolio-preview-note">
        @if (pro()) {
          <ul
            class="no-scrollbar -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:snap-none sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0"
            role="list"
            tabindex="0"
            aria-label="Trabajos de ejemplo"
          >
            @for (work of works(); track work.id) {
              <li class="w-[82%] flex-none snap-start sm:w-auto" data-testid="portfolio-preview-work">
                <ng-container *ngTemplateOutlet="card; context: { $implicit: work, large: false }" />
              </li>
            }
          </ul>
        } @else {
          <div class="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
            <div data-testid="portfolio-preview-work">
              <ng-container *ngTemplateOutlet="card; context: { $implicit: works()[0], large: true }" />
            </div>
            <!-- Lo que suma PRO: informativo, sin overlay ni popup. -->
            <aside class="rounded-2xl border border-line bg-brand-tint p-4" aria-labelledby="portfolio-preview-pro" data-testid="portfolio-preview-pro">
              <div class="flex -space-x-3" aria-hidden="true">
                @for (cover of proCovers; track cover) {
                  <img [src]="cover" alt="" width="56" height="40" class="h-10 w-14 rounded-lg border-2 border-surface object-cover" loading="lazy" decoding="async" />
                }
              </div>
              <h4 id="portfolio-preview-pro" class="mt-3 text-[15px] font-bold text-ink">Con Resuelve PRO</h4>
              <p class="mt-1 text-[14px] leading-relaxed text-ink-soft">
                Mostrá hasta {{ proLimit() }} trabajos con hasta {{ perWork }} fotos por cada uno.
              </p>
              <a
                routerLink="/pro/plan"
                class="mt-2 inline-flex min-h-11 items-center gap-1 rounded-lg text-[14px] font-semibold text-brand underline-offset-3 hover:underline"
                data-testid="portfolio-preview-pro-link"
                >Conocer PRO<app-icon name="arrow-right" [size]="14" [stroke]="2.2"
              /></a>
            </aside>
          </div>
        }
        <p id="portfolio-preview-note" class="mt-3 text-[13.5px] text-muted" data-testid="portfolio-preview-note">
          @if (pro()) {
            Hasta {{ proLimit() }} trabajos · hasta {{ perWork }} fotos por trabajo.
          }
          Las fotos son ejemplos: no se muestran en tu perfil.
        </p>
      </div>
    </div>

    <ng-template #card let-work let-large="large">
      <figure class="overflow-hidden rounded-2xl border border-line bg-surface">
        <div class="relative bg-sand">
          <img
            [src]="work.photos[0].src"
            [alt]="work.photos[0].alt"
            [attr.width]="large ? 697 : 472"
            [attr.height]="large ? 484 : 308"
            loading="lazy"
            decoding="async"
            class="w-full object-cover"
            [class]="large ? 'aspect-[16/10]' : 'aspect-[3/2]'"
          />
          <span class="absolute top-2.5 left-2.5 rounded-full bg-lightbox/75 px-2.5 py-1 text-[12.5px] font-semibold text-on-lightbox">Ejemplo</span>
          <span
            class="absolute right-2.5 bottom-2.5 inline-flex items-center gap-1 rounded-full bg-lightbox/75 px-2.5 py-1 text-[13px] font-semibold text-on-lightbox"
            aria-hidden="true"
            ><app-icon name="camera" [size]="13" [stroke]="2" />{{ work.photos.length }}</span
          >
        </div>
        <div class="grid gap-1.5 px-3 pt-2.5" [class]="large ? 'grid-cols-5' : 'grid-cols-4'" aria-hidden="true">
          @for (photo of work.photos.slice(large ? 0 : 1); track photo.src) {
            <img [src]="photo.src" alt="" width="68" height="46" loading="lazy" decoding="async" class="aspect-[4/3] w-full rounded-md bg-sand object-cover" />
          }
        </div>
        <figcaption class="px-4 pt-3 pb-4">
          <span class="block leading-snug font-bold text-ink" [class]="large ? 'text-[18px]' : 'text-[16px]'">{{ work.title }}</span>
          <span class="mt-0.5 block text-[14px] text-muted">{{ work.month }} · {{ work.photos.length }} fotos</span>
          <span class="mt-1.5 block text-[14px] leading-snug text-ink-soft">{{ work.description }}</span>
        </figcaption>
      </figure>
    </ng-template>
  `,
})
export class PortfolioPreview {
  /** Plan del portfolio (sale de `WorkPhotosStore.maxWorks`, que viene del backend). */
  readonly pro = input(false);
  readonly busy = input(false);
  readonly create = output<void>();

  protected readonly perWork = PHOTOS_PER_WORK;
  readonly proLimit = input(PRO_WORK_LIMIT);
  protected readonly works = computed(() => (this.pro() ? PRO_DEMO : [FREE_DEMO]));
  protected readonly proCovers = PRO_DEMO.slice(0, 3).map((w) => w.photos[0].src);
}
