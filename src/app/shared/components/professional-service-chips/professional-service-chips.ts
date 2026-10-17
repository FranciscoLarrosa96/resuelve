import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ProfessionalServiceSummary } from '../../../core/models/professional';
import { serviceChipsView } from '../../../core/utils/service-chips';
import { ServiceIcon } from '../icon/service-icon';

/**
 * Servicios del profesional como chips con el ícono del catálogo
 * (`app-service-icon`, por slug). Solo presenta: no rankea, no mira planes ni
 * matrícula. Máximo dos; el resto va en "+N" (nombres para lectores de
 * pantalla y tooltip; la lista completa está en el perfil). Sin servicios no
 * muestra nada.
 */
@Component({
  selector: 'app-professional-service-chips',
  imports: [ServiceIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.hidden]': '!view().visible.length' },
  styleUrl: './professional-service-chips.css',
  template: `
    @if (view().visible.length) {
      <ul class="service-chips" aria-label="Servicios que ofrece">
        @for (s of view().visible; track s.id) {
          <li class="service-chip" [attr.title]="s.name" data-testid="service-chip">
            <app-service-icon [slug]="s.slug" [size]="14" [stroke]="2.1" />
            <span class="service-chip-name">{{ s.name }}</span>
          </li>
        }
        @if (view().hidden.length; as extra) {
          <li class="service-chip service-chip-more" [attr.title]="hiddenNames()" data-testid="service-chip-more">
            <span aria-hidden="true">+{{ extra }}</span>
            <span class="sr-only">y {{ extra }} {{ extra === 1 ? 'servicio más' : 'servicios más' }}: {{ hiddenNames() }}</span>
          </li>
        }
      </ul>
    }
  `,
})
export class ProfessionalServiceChips {
  readonly services = input<readonly ProfessionalServiceSummary[] | null | undefined>([]);
  /** Servicio buscado (id del catálogo): si el profesional lo ofrece, va primero. */
  readonly matchServiceId = input<string | null | undefined>(null);
  protected readonly view = computed(() => serviceChipsView(this.services(), this.matchServiceId()));
  protected readonly hiddenNames = computed(() =>
    this.view()
      .hidden.map((s) => s.name)
      .join(', '),
  );
}
