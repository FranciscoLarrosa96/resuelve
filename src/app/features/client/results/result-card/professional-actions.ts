import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProfessionalSummary, contactChannelsOf } from '../../../../core/models/professional';
import { SearchStore } from '../../../../core/state/search.store';
import { Icon } from '../../../../shared/components/icon/icon';
import { SaveProfessional } from '../../../../shared/components/save-professional/save-professional';
import { ContactActions } from '../../../../shared/components/contact-actions/contact-actions';

/**
 * Las mismas acciones en todos los lugares del marketplace: contacto directo (WhatsApp,
 * Llamar) y "Pedir presupuesto", solo los canales que el profesional habilitó; más
 * perfil, guardar y comparar.
 */
@Component({
  selector: 'app-professional-actions',
  imports: [RouterLink, Icon, SaveProfessional, ContactActions],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px 24px;
    }
    .secondary {
      display: flex;
      align-items: center;
      gap: 24px;
    }
    .primary {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    @media (max-width: 767px) {
      :host {
        align-items: stretch;
        flex-direction: column;
      }
      .secondary {
        justify-content: space-between;
      }
      .primary {
        flex-direction: column;
        align-items: stretch;
      }
    }
  `,
  template: `
    <div class="primary">
      @if (requests()) {
        <button
          type="button"
          title="Se enviará a este profesional."
          class="button-primary action-link min-h-11 justify-center rounded-xl px-4 text-sm font-semibold"
          [attr.aria-label]="
            'Pedir presupuesto a ' + pro().displayName + '. Se enviará a este profesional.'
          "
          (click)="ask.emit(pro())"
        >
          Pedir presupuesto <app-icon name="arrow-right" [size]="17" />
        </button>
      }
      <app-contact-actions [professional]="pro()" [primary]="!requests()" [stretch]="true" />
    </div>
    <div class="secondary">
      <a
        [routerLink]="['/profesional', pro().id]"
        [queryParams]="search.mode() === 'request' ? { pedido: 1 } : null"
        class="profile-link"
        ><app-icon name="eye" [size]="18" /> Ver perfil</a
      >
      <app-save-professional [professionalId]="pro().id" [name]="pro().displayName" />
      @if (comparison()) {
        <button
          type="button"
          class="selection-control"
          [attr.aria-pressed]="selected()"
          [attr.aria-label]="
            (selected() ? 'Quitar de la comparación a ' : 'Comparar a ') + pro().displayName
          "
          (click)="search.toggleSelected(pro())"
        >
          <span class="selection-mark" [class.checked]="selected()" aria-hidden="true">
            @if (selected()) {
              <app-icon name="check" [size]="13" [stroke]="3" animate.enter="animate-pop" />
            }</span
          >{{ selected() ? 'Seleccionado' : 'Comparar' }}
        </button>
      }
    </div>
  `,
})
export class ProfessionalActions {
  protected readonly search = inject(SearchStore);
  readonly pro = input.required<ProfessionalSummary>();
  readonly comparison = input(true);
  readonly ask = output<ProfessionalSummary>();
  protected readonly selected = computed(() => this.search.selectedIds().includes(this.pro().id));
  /** Recibe solicitudes por Resuelve (si no, se lo contacta solo por WhatsApp o teléfono). */
  protected readonly requests = computed(() => contactChannelsOf(this.pro()).requests);
}
