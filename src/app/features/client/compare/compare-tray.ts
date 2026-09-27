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
 * deshabilitado y se invita a sumar otro; con 2–3, abre el comparador real.
 *
 * - `floating`: barra fija abajo del contenido (desktop).
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
        class="animate-up"
        [class]="variant() === 'floating' ? 'sticky bottom-4 z-10 rounded-2xl border border-line bg-white p-3.5 shadow-float' : 'rounded-2xl border border-line bg-white p-3'"
      >
        <div class="flex items-baseline justify-between gap-3">
          <h2 [id]="id('title')" class="text-[14.5px] font-bold text-ink">Comparar profesionales</h2>
          <button type="button" class="text-[13px] font-semibold text-muted hover:text-ink" (click)="comparison.clear()">Limpiar</button>
        </div>
        <p class="mt-0.5 text-[13px] text-muted" [id]="id('hint')" aria-live="polite">{{ hint() }}</p>

        <ul class="mt-2.5 flex flex-wrap items-center gap-2" [attr.aria-label]="'Profesionales en la comparación (' + items().length + ' de ' + max + ')'">
          @for (p of items(); track p.id) {
            <li class="flex items-center gap-1.5 rounded-full bg-sand py-1 pr-1 pl-1">
              <app-avatar [subject]="p.avatar" alt="" class="size-7 rounded-full text-[10.5px]" />
              <span class="max-w-32 truncate text-[13.5px] font-semibold text-ink">{{ p.firstName }}</span>
              <button
                type="button"
                class="grid size-7 place-items-center rounded-full text-muted hover:bg-white hover:text-ink"
                [attr.aria-label]="'Quitar a ' + p.displayName + ' de la comparación'"
                (click)="comparison.remove(p.id)"
              >
                <app-icon name="close" [size]="13" [stroke]="2.6" />
              </button>
            </li>
          }
          @if (showAdd() && !comparison.full()) {
            <li>
              <a [routerLink]="addLink().path" [queryParams]="addLink().query" class="flex h-9 items-center gap-1.5 rounded-full border border-dashed border-line-dash px-3 text-[13.5px] font-semibold text-brand hover:border-solid hover:bg-brand-tint">
                <app-icon name="plus" [size]="14" [stroke]="2.4" />Agregar otro
              </a>
            </li>
          }
        </ul>

        <div class="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          @if (showAsk()) {
            <button type="button" class="h-11 rounded-xl border border-line-btn bg-white px-4 text-[14px] font-semibold text-ink hover:bg-sand-light press" (click)="ask.emit()">
              {{ items().length === 1 ? 'Pedir presupuesto' : 'Pedir presupuesto a los ' + items().length }}
            </button>
          }
          <button
            type="button"
            class="flex h-11 items-center justify-center gap-2 rounded-xl px-4.5 text-[14.5px] font-bold disabled:cursor-not-allowed"
            [class]="comparison.canCompare() ? 'bg-brand text-white hover:bg-brand-dark press' : 'bg-sand text-subtle'"
            [disabled]="!comparison.canCompare()"
            [attr.aria-describedby]="comparison.canCompare() ? null : id('hint')"
            (click)="comparison.openCompare()"
          >
            <app-icon name="compare" [size]="17" />{{ comparison.canCompare() ? 'Comparar ' + items().length : 'Comparar' }}
          </button>
        </div>
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
    if (n < 2) return 'Agregado para comparar. Sumá al menos otro profesional.';
    return n < MAX_COMPARE ? 'Podés sumar uno más.' : `Máximo ${MAX_COMPARE}: para sumar otro, quitá uno.`;
  });

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
