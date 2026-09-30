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
  templateUrl: './compare-tray.html',
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
