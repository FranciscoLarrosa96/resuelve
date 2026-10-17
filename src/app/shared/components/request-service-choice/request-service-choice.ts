import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { RequestStore } from '../../../core/state/request.store';
import { ServiceIcon } from '../icon/service-icon';
import { ServicePicker } from '../service-picker/service-picker';

/**
 * Elegir el servicio del pedido: UNA sola implementación para el asistente (/solicitud) y /presupuesto.
 * - Con profesionales elegidos: solo los servicios que TODOS ofrecen (`RequestStore.offeredServices`).
 * - Sin ninguno en común: se explica y se ofrece cambiar los destinatarios; nunca se muestra todo el catálogo.
 * - Sin elegidos (o un borrador viejo sin sus servicios): el buscador del catálogo.
 * El backend sigue revalidando la elegibilidad al enviar.
 */
@Component({
  selector: 'app-request-service-choice',
  imports: [ServiceIcon, ServicePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (store.noCommonServices()) {
      <div
        class="rounded-2xl border border-accent-line bg-accent-soft p-4"
        role="alert"
        data-testid="no-common-services"
      >
        <p class="text-[15px] font-semibold text-ink">
          @if (store.recipients().length === 1) {
            {{ store.recipientNames() }} no tiene servicios para elegir en este pedido.
          } @else {
            {{ store.recipientNames() }} no tienen ningún servicio en común.
          }
        </p>
        <p class="mt-1 text-[14px] leading-[1.45] text-ink-soft">
          Para pedir presupuesto hace falta un servicio que ofrezcan todos los que elegiste. Cambiá los
          profesionales: tu pedido queda guardado.
        </p>
        <button
          type="button"
          class="button-primary mt-3 min-h-11 rounded-xl px-4.5 text-[15px] font-semibold"
          (click)="changeRecipients.emit()"
        >
          Cambiar profesionales
        </button>
      </div>
    } @else if (store.offeredServices(); as offered) {
      <div
        [id]="fieldId()"
        role="group"
        aria-label="Servicios que ofrecen los profesionales elegidos"
        class="flex flex-wrap gap-2"
        data-testid="offered-services"
      >
        @for (s of offered; track s.id) {
          <button
            type="button"
            class="flex items-center gap-2 rounded-full border-[1.5px] px-4 py-2.5 text-[15px] font-semibold text-ink hover:border-brand press"
            [class]="store.draft().service.slug === s.slug ? 'border-brand bg-brand-tint' : 'border-line-input bg-surface'"
            [attr.aria-pressed]="store.draft().service.slug === s.slug"
            (click)="store.setService(s)"
          >
            <app-service-icon [slug]="s.slug" [size]="17" class="text-brand" />{{ s.name }}
          </button>
        }
      </div>
    } @else {
      <app-service-picker [fieldId]="fieldId()" [selected]="store.draft().service.slug" (chosen)="store.setService($event)" />
    }
  `,
})
export class RequestServiceChoice {
  protected readonly store = inject(RequestStore);
  readonly fieldId = input.required<string>();
  /** La persona quiere cambiar a los destinatarios (no hay servicio común). */
  readonly changeRecipients = output<void>();
}
