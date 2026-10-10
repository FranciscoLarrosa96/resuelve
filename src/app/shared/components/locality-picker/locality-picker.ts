import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { LocalityOption, LocalityRef, toLocalityRef } from '../../../core/models/locality';
import { LocalityStore } from '../../../core/state/locality.store';
import { Dialog } from '../dialog/dialog';
import { Icon } from '../icon/icon';
import { LocalitySearch } from './locality-search';

let nextId = 0;

/**
 * Selector de ciudad: botón "📍 Mar del Plata, Buenos Aires" que abre un diálogo
 * (bottom sheet en mobile) con el buscador de localidades.
 * - `global` (default): cambia la ciudad de toda la app (`LocalityStore`).
 * - `emit`: solo avisa la elegida (formularios: cobertura, dónde es el trabajo).
 */
@Component({
  selector: 'app-locality-picker',
  imports: [Dialog, Icon, LocalitySearch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex min-w-0' },
  template: `
    <button
      type="button"
      class="flex min-w-0 items-center gap-1.5 rounded-full text-left font-semibold press"
      [class]="buttonClass()"
      [attr.aria-label]="ariaLabel()"
      aria-haspopup="dialog"
      data-testid="locality-picker"
      (click)="open.set(true)"
    >
      <app-icon name="pin" [size]="compact() ? 15 : 17" class="shrink-0" />
      <span class="truncate">{{ shown()?.label ?? emptyText() }}</span>
      <app-icon name="chevron-down" [size]="14" class="shrink-0 opacity-70" />
    </button>

    <app-dialog
      [open]="open()"
      [labelledBy]="uid + '-title'"
      variant="sheet"
      (dismiss)="open.set(false)"
    >
      <div class="flex items-start justify-between gap-3">
        <h2 [id]="uid + '-title'" class="font-display text-[22px] leading-tight font-semibold">
          {{ title() }}
        </h2>
        <button
          type="button"
          class="-mt-1 -mr-1 flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface-muted"
          aria-label="Cerrar"
          (click)="open.set(false)"
        >
          <app-icon name="close" [size]="18" />
        </button>
      </div>
      <p class="mt-1 text-[14.5px] text-ink-soft">{{ hint() }}</p>
      <!-- Solo con el diálogo abierto: la búsqueda no consulta nada hasta que se usa. -->
      @if (open()) {
        <!-- Carga diferida: el buscador no pesa en el arranque de la app. -->
        @defer {
          <app-locality-search class="mt-4" [excludeIds]="excludeIds()" (picked)="choose($event)" />
        } @placeholder {
          <div
            class="mt-4 h-12.5 rounded-xl border-[1.5px] border-line-input"
            aria-hidden="true"
          ></div>
        }
      }
    </app-dialog>
  `,
})
export class LocalityPicker {
  private readonly store = inject(LocalityStore);

  readonly mode = input<'global' | 'emit'>('global');
  /** En modo `emit`: lo que se muestra en el botón. */
  readonly value = input<LocalityRef | null>(null);
  readonly compact = input(false);
  readonly variant = input<'chip' | 'link' | 'field'>('chip');
  readonly emptyText = input('Elegí tu ciudad');
  readonly title = input('¿Dónde buscás?');
  readonly hint = input('Te mostramos profesionales que trabajan en esa localidad.');
  readonly excludeIds = input<readonly string[]>([]);
  readonly picked = output<LocalityRef>();

  protected readonly uid = `locality-picker-${++nextId}`;
  protected readonly open = signal(false);
  protected readonly shown = computed(() =>
    this.mode() === 'global' ? this.store.current() : this.value(),
  );
  protected readonly ariaLabel = computed(() => {
    const l = this.shown();
    return l ? `Ciudad: ${l.label}. Cambiar` : this.emptyText();
  });
  protected readonly buttonClass = computed(() => {
    switch (this.variant()) {
      case 'link':
        return 'h-10 px-1 text-[15px] text-brand underline-offset-4 hover:underline';
      case 'field':
        return 'h-12.5 w-full justify-between rounded-xl border-[1.5px] border-line-input bg-surface px-3.5 text-[15.5px] text-ink';
      default:
        return (
          'border border-line bg-surface text-ink hover:border-brand ' +
          (this.compact()
            ? 'h-9 max-w-[52vw] px-3 text-[14px] sm:max-w-[260px]'
            : 'h-11 max-w-full px-4 text-[15px]')
        );
    }
  });

  protected choose(option: LocalityOption): void {
    const ref = toLocalityRef(option);
    if (!ref) return;
    if (this.mode() === 'global') this.store.choose(ref);
    this.picked.emit(ref);
    this.open.set(false);
  }
}
