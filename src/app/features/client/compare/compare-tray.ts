import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { avatarOf } from '../../../core/models/avatar';
import { ComparisonStore, MAX_COMPARE } from '../../../core/state/comparison.store';
import { ProfessionalsStore } from '../../../core/state/professionals.store';
import { RequestStore } from '../../../core/state/request.store';
import { SearchStore } from '../../../core/state/search.store';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { Icon } from '../../../shared/components/icon/icon';

/**
 * Bandeja "Comparar profesionales": la misma en resultados y en el perfil
 * público (lee `ComparisonStore`). Con 1 elegido, "Comparar" queda
 * deshabilitado y se invita a sumar otro; con 2–6, abre el comparador real.
 *
 * - `floating`: barra fija sobre la navegación mobile o el borde desktop.
 * - `inline`: dentro de la barra de acciones de mobile.
 */
@Component({
  selector: 'app-compare-tray',
  imports: [RouterLink, Avatar, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (items().length) {
      <section
        [attr.aria-labelledby]="id('title')"
        data-testid="compare-tray"
        class="animate-up rounded-2xl border border-line bg-surface shadow-float"
        [class]="variant() === 'floating' ? 'fixed inset-x-3 bottom-[calc(84px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-275 p-3 lg:inset-x-6 lg:bottom-6 lg:p-3.5' : 'p-3'"
      >
        <div class="flex items-baseline justify-between gap-3">
          <h2 [id]="id('title')" class="text-[14.5px] font-bold text-ink"><span class="lg:hidden">{{ items().length }} {{ items().length === 1 ? 'seleccionado' : 'seleccionados' }}</span><span class="max-lg:hidden">Comparar profesionales</span></h2>
          <button type="button" class="rounded-md text-[13px] font-semibold text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" (click)="comparison.clear()">Limpiar</button>
        </div>
        <p class="mt-0.5 text-[12.5px] text-muted" [id]="id('hint')" aria-live="polite">{{ hint() }}</p>
        <span class="sr-only" aria-live="polite">{{ items().length }} de {{ max }} profesionales seleccionados.</span>

        <ul class="no-scrollbar mt-2.5 flex items-center gap-2 overflow-x-auto lg:flex-wrap" [attr.aria-label]="'Profesionales en la comparación (' + items().length + ' de ' + max + ')'">
          @for (p of items(); track p.id) {
            <li class="flex shrink-0 items-center gap-1 rounded-full bg-sand py-0.5 pr-0.5 pl-2 lg:gap-1.5 lg:pl-1">
              <span class="hidden lg:inline-flex"><app-avatar [subject]="p.avatar" alt="" class="size-7 rounded-full text-[10.5px]" /></span>
              <span class="max-w-24 truncate text-[13px] font-semibold text-ink lg:max-w-32 lg:text-[13.5px]">{{ p.firstName }}</span>
              <button
                type="button"
                class="grid size-8 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
                [attr.aria-label]="'Quitar a ' + p.displayName + ' de la comparación'"
                (click)="comparison.remove(p.id)"
              >
                <app-icon name="close" [size]="13" [stroke]="2.6" />
              </button>
            </li>
          }
          @if (showAdd() && !comparison.full()) {
            <li class="shrink-0">
              <a [routerLink]="addLink().path" [queryParams]="addLink().query" class="flex h-9 items-center gap-1.5 rounded-full border border-dashed border-line-dash px-3 text-[13.5px] font-semibold text-brand hover:border-solid hover:bg-brand-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                <app-icon name="plus" [size]="14" [stroke]="2.4" />Agregar otro
              </a>
            </li>
          }
        </ul>

        <div class="mt-3 gap-2" [class]="showAsk() ? 'grid grid-cols-2 lg:flex lg:justify-end' : 'flex justify-end'">
          @if (showAsk()) {
            <button type="button" class="min-h-11 rounded-xl border border-line-btn bg-surface px-2 text-[12.5px] font-semibold text-ink hover:bg-sand-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand lg:px-4 lg:text-[14px] press" (click)="ask.emit()">
              {{ askLabel() }}
            </button>
          }
          <button
            type="button"
            class="flex min-h-11 items-center justify-center gap-1 rounded-xl px-2 text-[13px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed lg:gap-2 lg:px-4.5 lg:text-[14.5px]"
            [class]="comparison.canCompare() ? 'bg-primary text-white hover:bg-primary-hover press' : 'bg-sand text-subtle'"
            [disabled]="!comparison.canCompare()"
            [attr.aria-describedby]="comparison.canCompare() ? null : id('hint')"
            (click)="comparison.openCompare()"
          >
            <app-icon name="compare" [size]="17" class="max-sm:hidden" />Comparar perfiles
          </button>
        </div>
        @if (showAsk()) {
          <p class="mt-1 text-right text-[12px] leading-[1.35] text-muted max-lg:sr-only">{{ askHint() }}</p>
        }
      </section>
    }
  `,
})
export class CompareTray {
  protected readonly comparison = inject(ComparisonStore);
  private readonly search = inject(SearchStore);
  private readonly request = inject(RequestStore);
  private readonly pros = inject(ProfessionalsStore);

  readonly variant = input<'floating' | 'inline'>('floating');
  /** "Agregar otro" (fuera de resultados: vuelve al listado con el mismo contexto). */
  readonly showAdd = input(false);
  /** "Pedir presupuesto a los N" (en resultados). */
  readonly showAsk = input(false);
  readonly idPrefix = input('compare-tray');
  readonly ask = output<void>();

  protected readonly max = MAX_COMPARE;
  protected readonly items = computed(() => this.comparison.selected().map((p) => ({ ...p, avatar: avatarOf(p) })));
  protected readonly hint = computed(() => {
    const n = this.items().length;
    if (n < 2) return 'Seleccionado. Sumá al menos otro perfil para comparar.';
    if (n === MAX_COMPARE - 1) return 'Podés sumar uno más.';
    return n < MAX_COMPARE ? `Podés sumar ${MAX_COMPARE - n} más.` : 'Alcanzaste el máximo para comparar.';
  });
  protected readonly askLabel = computed(() => {
    const n = this.items().length;
    return n === 1 ? 'Pedir presupuesto' : `Pedir presupuesto a los ${n}`;
  });
  protected readonly askHint = computed(() => this.items().length === 1
    ? 'Se enviará a este profesional.'
    : `Se enviará el mismo pedido a los ${this.items().length} profesionales seleccionados.`);

  /**
   * Volver al listado SIN perder el contexto: con un pedido, el mismo pedido;
   * explorando, el servicio filtrado (el barrio y demás filtros siguen en el
   * store). Abierto sin contexto: el servicio del primer elegido.
   */
  protected readonly addLink = computed(() => {
    if (this.search.mode() === 'request' && this.request.hasContext()) {
      return { path: '/profesionales', query: { pedido: 1 } as Record<string, string | number> };
    }
    const slug = this.pros.selectedService()?.slug ?? this.comparison.selected()[0]?.services[0]?.slug;
    return { path: '/profesionales', query: (slug ? { servicio: slug } : {}) as Record<string, string | number> };
  });

  protected id(part: string): string {
    return `${this.idPrefix()}-${part}`;
  }
}
