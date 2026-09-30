import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, PLATFORM_ID, ViewChild, effect, inject, input, output } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { Instance } from 'flatpickr/dist/types/instance';
import type { CustomLocale } from 'flatpickr/dist/types/locale';
import { Icon } from '../../../shared/components/icon/icon';

type PickerMode = 'date' | 'time';

const DATE_FORMAT = 'Y-m-d';
const TIME_FORMAT = 'H:i';
let pickerStylesPromise: Promise<void> | undefined;

function loadPickerStylesheet(path: string): Promise<void> {
  const href = new URL(path, document.baseURI).href;
  const existing = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')]
    .find((link) => link.href === href);
  if (existing?.sheet) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const link = existing ?? document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`No se pudo cargar el estilo del selector: ${path}`));
    if (!existing) document.head.append(link);
  });
}

function loadPickerStyles(): Promise<void> {
  pickerStylesPromise ??= Promise.all([
    loadPickerStylesheet('assets/vendor/flatpickr/flatpickr.min.css'),
    loadPickerStylesheet('styles/job-schedule-picker.css'),
  ]).then(() => undefined);
  return pickerStylesPromise;
}

@Component({
  selector: 'app-job-schedule-picker',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <div class="job-schedule-picker-wrap relative">
      <app-icon [name]="mode() === 'date' ? 'calendar' : 'clock'" [size]="17" [stroke]="2" class="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-brand" />
      <input
        #pickerInput
        type="text"
        class="job-schedule-picker-input h-11 w-full rounded-xl border border-line-input bg-surface px-3 pl-10 text-[14px] text-ink shadow-input transition-colors placeholder:text-muted hover:border-brand/50 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
        [placeholder]="mode() === 'date' ? 'Elegir fecha' : 'Elegir horario'"
        [attr.required]="mode() === 'date' ? '' : null"
        autocomplete="off"
        inputmode="text"
      />
    </div>
  `,
})
export class JobSchedulePicker implements AfterViewInit, OnDestroy {
  @ViewChild('pickerInput', { static: true }) private pickerInput!: ElementRef<HTMLInputElement>;

  readonly mode = input<PickerMode>('date');
  readonly value = input('');
  readonly minDate = input<string>();
  readonly valueChange = output<string>();

  private readonly platformId = inject(PLATFORM_ID);
  private picker?: Instance;
  private destroyed = false;

  constructor() {
    effect(() => {
      const value = this.value();
      const minDate = this.minDate();
      if (!this.picker) return;

      this.picker.set('minDate', this.mode() === 'date' ? minDate || undefined : undefined);
      this.picker.setDate(value || '', false, this.mode() === 'date' ? DATE_FORMAT : TIME_FORMAT);
    });
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) void this.loadPicker();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.picker?.destroy();
  }

  private async loadPicker(): Promise<void> {
    await loadPickerStyles();
    const [{ default: flatpickr }, { Spanish }] = await Promise.all([
      import('flatpickr'),
      // @ts-expect-error Flatpickr publishes no declarations for individual ESM locales.
      import('flatpickr/dist/esm/l10n/es.js') as Promise<{ Spanish: CustomLocale }>,
    ]);
    if (this.destroyed) return;

    const isDate = this.mode() === 'date';
    const monthShorthand = Spanish.months.shorthand.map((month) => month.toLocaleLowerCase('es-AR')) as unknown as CustomLocale['months']['shorthand'];
    const locale: Partial<CustomLocale> = {
      ...Spanish,
      months: {
        ...Spanish.months,
        shorthand: monthShorthand,
      },
    };

    this.picker = flatpickr(this.pickerInput.nativeElement, {
      locale,
      dateFormat: isDate ? DATE_FORMAT : TIME_FORMAT,
      altInput: true,
      altInputClass: 'job-schedule-picker-input h-11 w-full rounded-xl border border-line-input bg-surface px-3 pl-10 text-[14px] text-ink shadow-input transition-colors placeholder:text-muted hover:border-brand/50 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15',
      altFormat: isDate ? 'D j M Y' : TIME_FORMAT,
      ariaDateFormat: 'l j F Y',
      allowInput: true,
      disableMobile: true,
      minDate: isDate ? this.minDate() : undefined,
      enableTime: !isDate,
      noCalendar: !isDate,
      time_24hr: true,
      minuteIncrement: 15,
      hourIncrement: 1,
      closeOnSelect: isDate,
      monthSelectorType: 'dropdown',
      position: 'auto',
      animate: !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
      onReady: (_dates, _date, instance) => this.configureCalendar(instance),
      onChange: (_dates, dateString) => this.valueChange.emit(dateString),
    });

    this.picker.calendarContainer.classList.add('resuelve-picker');
    this.picker.setDate(this.value() || '', false, isDate ? DATE_FORMAT : TIME_FORMAT);
  }

  private configureCalendar(instance: Instance): void {
    const visibleInput = instance.altInput ?? instance.input;
    visibleInput.setAttribute('aria-label', this.mode() === 'date' ? 'Fecha del trabajo' : 'Horario opcional del trabajo');
    visibleInput.setAttribute('autocomplete', 'off');
    instance.calendarContainer.classList.add('resuelve-picker');

    const today = this.minDate();
    if (this.mode() !== 'date' || !today) return;

    const todayButton = document.createElement('button');
    todayButton.type = 'button';
    todayButton.className = 'flatpickr-footer-action';
    todayButton.setAttribute('aria-label', 'Seleccionar hoy');
    todayButton.textContent = 'Hoy';
    todayButton.addEventListener('click', () => {
      instance.setDate(today, true, DATE_FORMAT);
      instance.close();
    });
    instance.calendarContainer.append(todayButton);
  }
}
