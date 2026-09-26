import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChildren,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CreateQuotePayload, QUOTE_LIMITS } from '../../../core/models/quote';
import { BackNavigation } from '../../../core/services/back-navigation.service';
import { ProRequestsStore } from '../../../core/state/pro-requests.store';
import { ProStore } from '../../../core/state/pro.store';
import { quoteLimitReached } from '../../../core/utils/quote-usage';
import { QuoteLimitDialog } from '../../../shared/components/quote-limit-dialog/quote-limit-dialog';
import { addDays, dayOfWeek, formatDay } from '../../../core/utils/dates';
import { amountScale, formatARS, formatMoney, formatThousands, onlyDigits } from '../../../core/utils/format';
import { BackButton } from '../../../shared/components/back-button/back-button';
import { Icon } from '../../../shared/components/icon/icon';
import { SessionPending } from '../../../shared/components/session-pending/session-pending';
import { ChipDirective } from '../../../shared/directives/chip.directive';
import { clientName, proPersonalState, proRequestActions } from '../pro-ui';

interface ItemRow {
  key: number;
  description: string;
  /** Texto tal cual se escribe ("1,5"). */
  quantity: string;
  unitPrice: number;
}

/** Cantidad con hasta 2 decimales ("1,5" → 1.5). NaN si no es válida. */
export function parseQuantity(text: string): number {
  const clean = text.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return NaN;
  return Number(clean);
}

/**
 * Vista previa del total EN CENTAVOS (enteros, sin floats acumulados), con la
 * misma regla que el backend: materiales = suma de ítems si hay ítems. Es
 * solo visual: el total que vale es el que devuelve el servidor.
 */
export function previewTotalCents(labor: number, materials: number, items: { quantity: number; unitPrice: number }[]): number {
  const laborCents = Math.round(labor * 100);
  const materialsCents = items.length
    ? items.reduce((sum, i) => sum + Math.round(Math.round(i.unitPrice * 100) * i.quantity), 0)
    : Math.round(materials * 100);
  return laborCents + materialsCents;
}

const VALIDITY_DAYS = [3, 7, 15];

/**
 * Desde este total (en pesos) se marca el monto como "alto" para que un cero
 * de más se note antes de enviar. No bloquea: el profesional decide.
 */
export const HIGH_TOTAL_WARNING = 10_000_000;

@Component({
  selector: 'app-pro-quote-page',
  imports: [RouterLink, BackButton, Icon, SessionPending, ChipDirective, QuoteLimitDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-quote-page.html',
})
export class ProQuotePage {
  private readonly router = inject(Router);
  private readonly backNav = inject(BackNavigation);
  protected readonly store = inject(ProRequestsStore);
  private readonly pro = inject(ProStore);

  /** Parámetro de ruta :id */
  readonly id = input.required<string>();

  protected readonly limits = QUOTE_LIMITS;
  protected readonly ars = formatARS;
  protected readonly money = formatMoney;
  protected readonly thousands = formatThousands;
  protected readonly day = formatDay;
  protected readonly client = clientName;
  protected readonly state = (r: Parameters<typeof proPersonalState>[0]) => proPersonalState(r).title;
  protected readonly scale = amountScale;

  protected readonly req = computed(() => {
    const r = this.store.detail();
    return r && r.id === this.id() ? r : null;
  });
  protected readonly actions = computed(() => (this.req() ? proRequestActions(this.req()!) : null));
  protected readonly urgent = computed(() => this.req()?.urgency === 'URGENT');

  // ---- Formulario ----------------------------------------------------
  protected readonly description = signal('');
  protected readonly labor = signal(0);
  protected readonly materials = signal(0);
  protected readonly items = signal<ItemRow[]>([]);
  private itemKey = 0;
  /** Días desde hoy (0 = hoy) o null = sin fecha. */
  protected readonly fromOffset = signal<number | null>(null);
  protected readonly validityDays = signal<number | null>(7);
  protected readonly submitted = signal(false);

  protected readonly fromOptions = (() => {
    const now = new Date();
    return [0, 1, 2, 3].map((offset) => {
      const d = addDays(now, offset);
      return { offset, label: offset === 0 ? 'Hoy' : offset === 1 ? 'Mañana' : `${dayOfWeek(d)} ${d.getDate()}/${d.getMonth() + 1}` };
    });
  })();
  protected readonly validities = VALIDITY_DAYS;

  private readonly parsedItems = computed(() =>
    this.items().map((i) => ({ description: i.description.trim(), quantity: parseQuantity(i.quantity), unitPrice: i.unitPrice })),
  );
  protected readonly itemsTotalCents = computed(() => previewTotalCents(0, 0, this.validItems()));
  private readonly validItems = computed(() =>
    this.parsedItems().filter((i) => Number.isFinite(i.quantity) && i.quantity > 0),
  );
  protected readonly totalCents = computed(() => previewTotalCents(this.labor(), this.materials(), this.validItems()));

  protected readonly errors = computed(() => {
    const errors: string[] = [];
    const desc = this.description().trim();
    if (desc.length < QUOTE_LIMITS.descriptionMin) errors.push(`Describí el trabajo (mínimo ${QUOTE_LIMITS.descriptionMin} caracteres).`);
    const items = this.parsedItems();
    if (items.some((i) => i.description.length < QUOTE_LIMITS.itemDescriptionMin))
      errors.push('Cada material necesita un concepto (mínimo 2 caracteres).');
    if (items.some((i) => !Number.isFinite(i.quantity) || i.quantity <= 0 || i.quantity > QUOTE_LIMITS.maxQuantity))
      errors.push('Revisá las cantidades (mayores a 0, hasta 2 decimales).');
    if (this.totalCents() <= 0) errors.push('El total tiene que ser mayor a cero.');
    return errors;
  });

  protected readonly highTotal = computed(() => this.totalCents() / 100 >= HIGH_TOTAL_WARNING);

  protected readonly canSend = computed(
    () => !this.store.quoteSending() && !this.store.sentQuote() && !this.errors().length && !!this.actions(),
  );

  // ---- Cupo FREE (lo decide el backend; acá solo se explica) ------------
  protected readonly usage = computed(() => this.pro.ownProfile()?.quoteUsage ?? null);
  /** Cupo agotado ANTES de enviar: el formulario avisa (y el backend igual lo rechazaría). */
  protected readonly limitReached = computed(() => quoteLimitReached(this.usage()));
  /** Este envío usó el último presupuesto del mes: se avisa sin tapar el éxito. */
  protected readonly lastOfMonth = computed(() => !!this.store.sentQuote() && quoteLimitReached(this.usage()));
  protected readonly limitDialog = signal(false);

  private readonly alerts = viewChildren<ElementRef<HTMLElement>>('quoteAlert');
  private readonly sentHeadings = viewChildren<ElementRef<HTMLElement>>('sentHeading');

  constructor() {
    this.store.resetQuote();
    this.pro.refreshProfile();
    effect(() => {
      const id = this.id();
      if (this.store.hasProfile()) untracked(() => this.store.loadDetail(id));
    });
    // Intento de responder con el cupo agotado (rechazo real del backend).
    effect(() => {
      if (this.store.quoteLimitHit()) untracked(() => this.limitDialog.set(true));
    });
  }

  protected onDescription(event: Event): void {
    this.description.set((event.target as HTMLTextAreaElement).value);
  }

  protected setAmount(field: 'labor' | 'materials', event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = onlyDigits(input.value);
    (field === 'labor' ? this.labor : this.materials).set(value);
    input.value = formatThousands(value);
  }

  protected addItem(): void {
    if (this.items().length >= QUOTE_LIMITS.maxItems) return;
    this.items.update((list) => [...list, { key: ++this.itemKey, description: '', quantity: '1', unitPrice: 0 }]);
  }

  protected removeItem(key: number): void {
    this.items.update((list) => list.filter((i) => i.key !== key));
  }

  protected setItem(key: number, field: 'description' | 'quantity' | 'unitPrice', event: Event): void {
    const input = event.target as HTMLInputElement;
    let value: string | number = input.value;
    if (field === 'unitPrice') {
      value = onlyDigits(input.value);
      input.value = formatThousands(value);
    }
    this.items.update((list) => list.map((i) => (i.key === key ? { ...i, [field]: value } : i)));
  }

  /** Payload del DTO real. Nunca `totalAmount`: lo calcula el servidor. */
  protected buildPayload(): CreateQuotePayload {
    const items = this.parsedItems();
    const now = new Date();
    const payload: CreateQuotePayload = { description: this.description().trim(), laborAmount: this.labor() };
    if (items.length) payload.items = items;
    else payload.materialsAmount = this.materials();
    const from = this.fromOffset();
    if (from !== null) {
      const d = addDays(now, from);
      payload.availableFrom = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
    }
    const validity = this.validityDays();
    if (validity !== null) {
      const d = addDays(now, validity);
      payload.validUntil = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).toISOString();
    }
    return payload;
  }

  protected async send(): Promise<void> {
    this.submitted.set(true);
    if (!this.canSend()) return;
    // Cupo ya agotado según el backend: se explica sin mandar un pedido que va a rechazar.
    // (Si el dato estaba viejo, el backend igual responde FREE_QUOTE_LIMIT_REACHED.)
    if (this.limitReached()) {
      this.limitDialog.set(true);
      return;
    }
    const quote = await this.store.sendQuote(this.id(), this.buildPayload());
    const list = quote ? this.sentHeadings : this.alerts;
    setTimeout(() => list().find((e) => e.nativeElement.offsetParent)?.nativeElement.focus());
  }

  protected back(): void {
    this.backNav.back(['/pro/solicitudes', this.id()]);
  }

  protected toList(): void {
    this.router.navigate(['/pro/solicitudes']);
  }

  protected toRequest(): void {
    this.router.navigate(['/pro/solicitudes', this.id()]);
  }
}
