import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { LocalityLink } from '../../../core/state/locality-link';
import { LocalityStore } from '../../../core/state/locality.store';
import { LocalityPicker } from '../locality-picker/locality-picker';

/**
 * Aviso cuando el enlace trae una ciudad que no se pudo usar: nunca se reemplaza en silencio.
 * Requiere `LocalityLink` en los proveedores de la página.
 */
@Component({
  selector: 'app-locality-link-notice',
  imports: [LocalityPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (link.needsNotice()) {
      <div
        role="status"
        data-testid="locality-link-notice"
        class="my-4 rounded-xl border border-line bg-accent-soft p-4 text-sm text-accent-ink"
      >
        <p>{{ text() }}</p>
        @if (link.state() !== 'order') {
          <div class="mt-3"><app-locality-picker emptyText="Elegir ciudad" /></div>
        }
      </div>
    }
  `,
})
export class LocalityLinkNotice {
  protected readonly link = inject(LocalityLink);
  private readonly locality = inject(LocalityStore);

  protected readonly text = computed(() => {
    const current = this.locality.label();
    const fallback = current
      ? ` Mientras tanto te mostramos ${current}; podés elegir otra.`
      : ' Elegí la ciudad donde buscás.';
    switch (this.link.state()) {
      case 'incomplete':
        return `El enlace no indica la provincia y la ciudad completas, así que no sabemos cuál elegir.${fallback}`;
      case 'order': {
        const work = this.link.orderLocality();
        return `Tu pedido es en ${work?.label ?? 'otra ciudad'}, así que seguimos con esa ciudad. El enlace indicaba otra.`;
      }
      default:
        return `No encontramos la ciudad del enlace.${fallback}`;
    }
  });
}
