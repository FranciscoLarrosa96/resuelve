import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  Subject,
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  startWith,
  switchMap,
  tap,
} from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LocalitiesApiService } from '../../../core/api/localities-api.service';
import { LocalityOption } from '../../../core/models/locality';
import { Icon } from '../icon/icon';

let nextId = 0;

/** Espera entre teclas antes de buscar (y cancela la búsqueda anterior). */
export const LOCALITY_SEARCH_DEBOUNCE_MS = 200;

type SearchState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Combobox de localidades (patrón ARIA "combobox + listbox"): busca en el
 * backend con debounce y cancelación (switchMap), nunca carga el catálogo
 * entero. Muestra localidad y provincia (y el departamento si hay homónimos).
 * Sin texto sugiere las ciudades que ya tienen profesionales.
 * Teclado: ↑/↓ recorren, Enter elige, Escape limpia.
 */
@Component({
  selector: 'app-locality-search',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <label [for]="uid + '-input'" class="block text-[14px] font-semibold">{{ label() }}</label>
    <div class="relative mt-1.5">
      <app-icon
        name="search"
        [size]="17"
        class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
      />
      <input
        #input
        [id]="uid + '-input'"
        type="text"
        role="combobox"
        autocomplete="off"
        spellcheck="false"
        maxlength="80"
        [placeholder]="placeholder()"
        aria-autocomplete="list"
        [attr.aria-expanded]="options().length > 0"
        [attr.aria-controls]="uid + '-list'"
        [attr.aria-activedescendant]="active() >= 0 ? uid + '-opt-' + active() : null"
        [attr.aria-describedby]="uid + '-status'"
        class="h-12.5 w-full rounded-xl border-[1.5px] border-line-input bg-surface pr-3.5 pl-10 text-[15.5px] text-ink outline-none focus:border-brand"
        [value]="text()"
        (input)="onInput($event)"
        (keydown)="onKey($event)"
      />
    </div>

    <p [id]="uid + '-status'" class="sr-only" role="status" aria-live="polite">
      {{ statusText() }}
    </p>

    @if (state() === 'loading' && !options().length) {
      <ul class="mt-2 space-y-1" aria-hidden="true">
        @for (s of [1, 2, 3]; track s) {
          <li class="shimmer h-12 rounded-xl"></li>
        }
      </ul>
    } @else if (state() === 'error') {
      <div class="mt-3 flex items-center gap-3 text-[14.5px] text-ink-soft" role="alert">
        No pudimos buscar localidades.
        <button type="button" class="font-semibold text-brand underline" (click)="retry()">
          Reintentar
        </button>
      </div>
    } @else if (state() === 'ready' && !options().length) {
      <p class="mt-3 text-[14.5px] text-ink-soft" data-testid="locality-empty">
        @if (query()) {
          No encontramos “{{ query() }}”. Probá con otro nombre o sin abreviaturas.
        } @else {
          Escribí el nombre de tu ciudad o localidad.
        }
      </p>
    }

    @if (options().length) {
      @if (!query()) {
        <p class="mt-3 text-[13px] font-semibold tracking-wide text-muted uppercase">
          Ciudades con profesionales
        </p>
      }
      <ul
        [id]="uid + '-list'"
        role="listbox"
        [attr.aria-label]="label()"
        class="mt-2 max-h-[min(50dvh,360px)] overflow-y-auto"
        data-testid="locality-options"
      >
        @for (o of options(); track o.id; let i = $index) {
          <li
            [id]="uid + '-opt-' + i"
            role="option"
            [attr.aria-selected]="active() === i"
            [attr.aria-disabled]="isExcluded(o.id) || null"
            class="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5"
            [class.bg-brand-tint]="active() === i"
            [class.opacity-50]="isExcluded(o.id)"
            (mousedown)="$event.preventDefault()"
            (click)="pick(o)"
            (mouseenter)="active.set(i)"
          >
            <app-icon name="pin" [size]="17" class="shrink-0 text-brand" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[15.5px] font-semibold text-ink">{{
                nameOf(o)
              }}</span>
              <span class="block truncate text-[13.5px] text-muted">{{ o.province.name }}</span>
            </span>
            @if (isExcluded(o.id)) {
              <span class="text-[13px] text-muted">Ya agregada</span>
            }
          </li>
        }
      </ul>
    }
  `,
})
export class LocalitySearch {
  private readonly api = inject(LocalitiesApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly label = input('Buscá tu ciudad o localidad');
  readonly placeholder = input('Por ejemplo: Mar del Plata');
  /** Localidades que no se pueden volver a elegir (ya están en la cobertura). */
  readonly excludeIds = input<readonly string[]>([]);
  readonly autofocus = input(true);
  readonly picked = output<LocalityOption>();

  protected readonly uid = `locality-search-${++nextId}`;
  private readonly inputEl = viewChild<ElementRef<HTMLInputElement>>('input');
  protected readonly text = signal('');
  protected readonly query = computed(() => this.text().trim());
  protected readonly options = signal<LocalityOption[]>([]);
  protected readonly state = signal<SearchState>('idle');
  protected readonly active = signal(-1);
  /** Texto + intento: Reintentar repite la misma búsqueda (distinctUntilChanged no la descarta). */
  private readonly terms = new Subject<{ text: string; attempt: number }>();
  private attempt = 0;

  protected readonly statusText = computed(() => {
    if (this.state() === 'loading') return 'Buscando localidades…';
    if (this.state() === 'error') return 'No pudimos buscar localidades.';
    const n = this.options().length;
    if (this.state() === 'ready')
      return n
        ? `${n} localidad${n === 1 ? '' : 'es'}. Usá las flechas para elegir.`
        : 'Sin resultados.';
    return '';
  });

  constructor() {
    this.terms
      .pipe(
        startWith({ text: '', attempt: 0 }),
        map((t) => ({ text: t.text.trim(), attempt: t.attempt })),
        debounceTime(LOCALITY_SEARCH_DEBOUNCE_MS),
        distinctUntilChanged((a, b) => a.text === b.text && a.attempt === b.attempt),
        tap(() => this.state.set('loading')),
        // switchMap: una respuesta vieja nunca pisa a una búsqueda más nueva.
        switchMap(({ text: t }) =>
          (t.length === 1 ? of([] as LocalityOption[]) : this.api.search(t, 8)).pipe(
            map((items) => ({ ok: true as const, items })),
            catchError(() => of({ ok: false as const, items: [] as LocalityOption[] })),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res) => {
        this.options.set(res.items);
        this.active.set(res.items.length ? 0 : -1);
        this.state.set(res.ok ? 'ready' : 'error');
      });
    afterNextRender(() => {
      if (this.autofocus()) this.inputEl()?.nativeElement.focus();
    });
  }

  protected nameOf(o: LocalityOption): string {
    // Con homónimos en la provincia, el label ya trae el departamento: "El Rincón (Caucete), San Juan".
    return o.label.endsWith(`, ${o.province.name}`)
      ? o.label.slice(0, -(o.province.name.length + 2))
      : o.name;
  }

  protected isExcluded(id: string): boolean {
    return this.excludeIds().includes(id);
  }

  protected onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.text.set(value);
    this.terms.next({ text: value, attempt: this.attempt });
  }

  protected retry(): void {
    this.terms.next({ text: this.text(), attempt: ++this.attempt });
  }

  protected onKey(event: KeyboardEvent): void {
    const n = this.options().length;
    if (event.key === 'ArrowDown' && n) {
      event.preventDefault();
      this.active.update((i) => (i + 1) % n);
    } else if (event.key === 'ArrowUp' && n) {
      event.preventDefault();
      this.active.update((i) => (i <= 0 ? n - 1 : i - 1));
    } else if (event.key === 'Enter') {
      const option = this.options()[this.active()];
      if (option) {
        event.preventDefault();
        this.pick(option);
      }
    } else if (event.key === 'Escape' && this.text()) {
      event.stopPropagation();
      event.preventDefault();
      this.text.set('');
      this.terms.next({ text: '', attempt: this.attempt });
    }
  }

  protected pick(option: LocalityOption): void {
    if (this.isExcluded(option.id)) return;
    this.picked.emit(option);
  }
}
