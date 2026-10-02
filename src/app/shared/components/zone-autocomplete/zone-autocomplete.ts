import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';

export interface ZoneOption {
  id: string;
  name: string;
}

/** "El Tropezón" → "el tropezon": se busca sin tildes, mayúsculas ni guiones. */
export function normalizeZoneText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Barrios que coinciden con lo escrito, mejores primero: empieza igual, una
 * palabra empieza igual ("tropezon" en "El Tropezón"), y por último contiene.
 * Sin texto devuelve todos en su orden. Los ya elegidos (`excludeIds`) no se ofrecen.
 */
export function matchZones<T extends ZoneOption>(
  zones: readonly T[],
  query: string,
  excludeIds: readonly string[] = [],
): T[] {
  const q = normalizeZoneText(query);
  const pool = zones.filter((z) => !excludeIds.includes(z.id));
  if (!q) return [...pool];
  const rank = (z: T): number => {
    const name = normalizeZoneText(z.name);
    if (name.startsWith(q)) return 0;
    if (name.split(' ').some((word) => word.startsWith(q))) return 1;
    return name.includes(q) ? 2 : -1;
  };
  return pool
    .map((zone, index) => ({ zone, index, score: rank(zone) }))
    .filter((r) => r.score >= 0)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((r) => r.zone);
}

let sequence = 0;

/**
 * Autocompletado de barrios (combobox accesible, patrón ARIA "list"): escribís
 * y se filtra (sin tildes); flechas recorren, Enter elige, Escape cierra. Sirve
 * para elegir uno (pedido) o sumar varios (cobertura del profesional).
 */
@Component({
  selector: 'app-zone-autocomplete',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block', '(document:click)': 'onDocumentClick($event)' },
  template: `
    <input
      type="text"
      role="combobox"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      aria-autocomplete="list"
      class="field-control h-12 w-full min-w-0 rounded-xl px-3.5 text-base text-ink"
      [id]="inputId()"
      [placeholder]="placeholder()"
      [value]="query()"
      [disabled]="disabled()"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="listId"
      [attr.aria-activedescendant]="open() && options().length ? optionId(active()) : null"
      [attr.aria-describedby]="describedBy()"
      [attr.aria-labelledby]="labelledBy()"
      [attr.aria-label]="labelledBy() ? null : 'Barrio'"
      [attr.aria-invalid]="invalid() ? 'true' : null"
      (input)="onInput($event)"
      (focus)="open.set(true)"
      (keydown)="onKey($event)"
    />
    @if (open()) {
      <ul
        [id]="listId"
        role="listbox"
        aria-label="Barrios"
        class="absolute inset-x-0 top-[calc(100%+4px)] z-30 m-0 max-h-60 list-none overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface-elevated p-1 shadow-soft"
      >
        @for (z of options(); track z.id; let i = $index) {
          <li
            role="option"
            [id]="optionId(i)"
            [attr.aria-selected]="i === active()"
            class="flex min-h-11 cursor-pointer items-center rounded-lg px-3 text-[15px] font-medium text-ink"
            [class.bg-brand-tint]="i === active()"
            [class.text-brand-dark]="i === active()"
            (mousedown)="$event.preventDefault()"
            (mouseenter)="active.set(i)"
            (click)="choose(z)"
          >
            {{ z.name }}
          </li>
        } @empty {
          <li class="px-3 py-3 text-[14px] text-muted" role="presentation">
            No encontramos ese barrio. Probá con otro nombre.
          </li>
        }
      </ul>
    }
    <span class="sr-only" role="status" aria-live="polite">{{ status() }}</span>
  `,
})
export class ZoneAutocomplete {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly zones = input.required<readonly ZoneOption[]>();
  /** Ya elegidos (cobertura múltiple): no se vuelven a ofrecer. */
  readonly excludeIds = input<readonly string[]>([]);
  readonly inputId = input(`zone-autocomplete-${++sequence}`);
  readonly placeholder = input('Escribí tu barrio');
  readonly labelledBy = input<string | null>(null);
  readonly describedBy = input<string | null>(null);
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly chosen = output<ZoneOption>();

  protected readonly listId = `zone-list-${sequence}`;
  protected readonly query = signal('');
  protected readonly open = signal(false);
  protected readonly active = signal(0);
  protected readonly options = computed(() => matchZones(this.zones(), this.query(), this.excludeIds()));
  protected readonly status = computed(() => {
    if (!this.open()) return '';
    const n = this.options().length;
    return n ? `${n} ${n === 1 ? 'barrio' : 'barrios'}` : 'Sin resultados';
  });

  protected optionId(i: number): string {
    return `${this.listId}-opt-${i}`;
  }

  protected onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.active.set(0);
    this.open.set(true);
  }

  protected onKey(event: KeyboardEvent): void {
    const count = this.options().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.open.set(true);
        if (count) this.active.update((i) => (i + 1) % count);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.open.set(true);
        if (count) this.active.update((i) => (i - 1 + count) % count);
        break;
      case 'Home':
        if (this.open() && count) {
          event.preventDefault();
          this.active.set(0);
        }
        break;
      case 'End':
        if (this.open() && count) {
          event.preventDefault();
          this.active.set(count - 1);
        }
        break;
      case 'Enter':
        // Nunca envía un formulario con la lista abierta: elige la opción activa (o la única).
        if (this.open() && count) {
          event.preventDefault();
          this.choose(this.options()[this.active()] ?? this.options()[0]);
        }
        break;
      case 'Escape':
        if (this.open()) {
          event.preventDefault();
          event.stopPropagation();
          this.open.set(false);
        }
        break;
      case 'Tab':
        this.open.set(false);
        break;
    }
    this.scrollActiveIntoView();
  }

  protected choose(zone: ZoneOption): void {
    this.chosen.emit(zone);
    this.query.set('');
    this.active.set(0);
    this.open.set(false);
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }

  private scrollActiveIntoView(): void {
    queueMicrotask(() =>
      this.host.nativeElement.querySelector(`#${CSS.escape(this.optionId(this.active()))}`)?.scrollIntoView({ block: 'nearest' }),
    );
  }
}
