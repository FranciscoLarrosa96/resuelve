import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ProStore } from '../../../core/state/pro.store';

/**
 * Toggle "Disponible hoy" del profesional (sidebar desktop y dashboard mobile).
 * Persiste en el backend (PATCH /pro/availability). Si todavía no se sabe el
 * valor real (sin perfil profesional, cargando o error) no se muestra: nunca
 * un switch que no guarda nada.
 */
@Component({
  selector: 'app-availability-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (store.available() !== null) {
    <button
      type="button"
      role="switch"
      [attr.aria-checked]="store.available()"
      class="flex w-full items-center text-left transition-[color,background-color,border-color,box-shadow] duration-200 disabled:cursor-wait"
      [class]="
        (compact() ? 'gap-2.5 rounded-xl border p-3 ' : 'gap-3.5 rounded-2xl border-[1.5px] px-4 py-3.75 ') +
        (store.available() ? 'border-brand-line bg-brand-tint' : 'border-track bg-white')
      "
      [disabled]="store.savingAvailability()"
      [attr.aria-busy]="store.savingAvailability()"
      (click)="store.toggleAvailability()"
    >
      <span class="min-w-0 flex-1">
        <span class="block font-semibold text-ink" [class]="compact() ? 'text-sm' : 'text-base'">
          {{ store.available() ? 'Disponible hoy' : 'No disponible hoy' }}
        </span>
        <span class="mt-0.5 block text-muted" [class]="compact() ? 'text-xs' : 'text-[13.5px]'">
          {{ store.available() ? 'Aparecés en búsquedas y urgencias' : compact() ? 'Tu perfil sigue visible' : 'Tu perfil sigue visible, sin turnos hoy' }}
        </span>
      </span>
      <span
        class="relative shrink-0 rounded-full transition-colors duration-200"
        [class]="(compact() ? 'h-6 w-10 ' : 'h-8 w-13 ') + (store.available() ? 'bg-success' : 'bg-line-dash')"
        aria-hidden="true"
      >
        <span
          class="absolute top-[3px] left-[3px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.2)] transition-transform duration-200 ease-(--ease-out-soft)"
          [class]="compact() ? 'size-4.5' : 'size-6.5'"
          [style.transform]="'translateX(' + (store.available() ? (compact() ? 16 : 20) : 0) + 'px)'"
        ></span>
      </span>
    </button>
    }
  `,
})
export class AvailabilitySwitch {
  protected readonly store = inject(ProStore);
  readonly variant = input<'compact' | 'card'>('card');
  protected compact(): boolean {
    return this.variant() === 'compact';
  }
}
