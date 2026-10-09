import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TransferOption, TransferPayment } from '../../../core/models/transfer';
import { ProStore } from '../../../core/state/pro.store';
import { PROOF_ACCEPT, TransferStore } from '../../../core/state/transfer.store';
import { billingDate } from '../../../core/utils/billing-copy';
import { proPriceAmount } from '../../../core/utils/quote-usage';
import { Dialog } from '../../../shared/components/dialog/dialog';
import { Icon } from '../../../shared/components/icon/icon';

/** Alias (6 a 20: letras, números, punto, guion) o CBU/CVU de 22 dígitos: el backend lo revalida. */
const REFUND_DESTINATION = /^(?:[A-Za-z0-9.-]{6,20}|\d{22})$/;

const monthsText = (n: number) => (n === 1 ? '1 mes' : `${n} meses`);

/**
 * "Pagar por transferencia" en Mi plan: elegir 1, 3 o 6 meses, ver los datos
 * y el código para el concepto, avisar "Ya transferí" (comprobante opcional)
 * y seguir el estado hasta que un admin lo confirma. Prepago, sin renovación.
 * No aparece si el admin no cargó los datos bancarios ni si ya paga con
 * Mercado Pago. Todo monto y fecha sale del backend.
 */
@Component({
  selector: 'app-pro-transfer-panel',
  imports: [Dialog, FormsModule, Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible() && o(); as o) {
      <section
        id="transferencia"
        class="mt-8 scroll-mt-6 rounded-2xl border border-line bg-surface p-5 md:p-6"
        aria-labelledby="transfer-title"
        data-testid="transfer-panel"
      >
        <p class="text-[13px] font-semibold tracking-[0.1em] text-muted uppercase">Pagar por transferencia</p>

        @if (o.pending; as p) {
          @if (p.status === 'AWAITING_PROOF') {
            <h2 id="transfer-title" class="mt-1 font-sans text-[22px] font-bold text-ink" data-testid="transfer-amount">
              Transferí {{ amount(p.amountArs) }}
            </h2>
            <p class="mt-1 text-[15px] text-ink-soft">{{ months(p.months) }} de Resuelve PRO. Se paga por adelantado y no se renueva solo.</p>

            <ol class="mt-5 flex flex-col gap-5">
              <li class="flex gap-3">
                <span class="font-sans text-[20px] leading-6 font-bold text-brand" aria-hidden="true">1</span>
                <div class="min-w-0 flex-1">
                  <p class="font-semibold text-ink">Transferí a esta cuenta</p>
                  @if (o.account; as a) {
                    <dl class="mt-2 grid gap-x-6 gap-y-2 text-[15px] sm:grid-cols-2">
                      <div>
                        <dt class="text-[13.5px] text-muted">Alias</dt>
                        <dd class="flex items-center gap-2 font-semibold text-ink">
                          <span class="break-all" data-testid="transfer-alias">{{ a.alias }}</span>
                          <button type="button" class="copy-button" (click)="copy('alias', a.alias)" [attr.aria-label]="'Copiar alias ' + a.alias">
                            <app-icon [name]="copied() === 'alias' ? 'check' : 'copy'" [size]="15" />
                          </button>
                        </dd>
                      </div>
                      @if (a.cbu) {
                        <div>
                          <dt class="text-[13.5px] text-muted">CBU/CVU</dt>
                          <dd class="flex items-center gap-2 font-semibold text-ink tabular-nums">
                            <span class="break-all">{{ a.cbu }}</span>
                            <button type="button" class="copy-button" (click)="copy('cbu', a.cbu)" aria-label="Copiar CBU/CVU">
                              <app-icon [name]="copied() === 'cbu' ? 'check' : 'copy'" [size]="15" />
                            </button>
                          </dd>
                        </div>
                      }
                      <div>
                        <dt class="text-[13.5px] text-muted">Titular</dt>
                        <dd class="font-semibold text-ink">{{ a.holder }}</dd>
                      </div>
                      @if (a.bank) {
                        <div><dt class="text-[13.5px] text-muted">Banco</dt><dd class="font-semibold text-ink">{{ a.bank }}</dd></div>
                      }
                      @if (a.cuit) {
                        <div><dt class="text-[13.5px] text-muted">CUIT</dt><dd class="font-semibold text-ink tabular-nums">{{ a.cuit }}</dd></div>
                      }
                    </dl>
                  }
                </div>
              </li>
              <li class="flex gap-3">
                <span class="font-sans text-[20px] leading-6 font-bold text-brand" aria-hidden="true">2</span>
                <div class="min-w-0 flex-1">
                  <p class="font-semibold text-ink">En el concepto o la descripción, poné este código</p>
                  <p class="mt-2 flex items-center gap-2">
                    <span class="rounded-lg bg-sand px-3 py-1.5 font-mono text-[17px] font-bold tracking-[0.06em] text-ink" data-testid="transfer-reference">{{ p.reference }}</span>
                    <button type="button" class="copy-button" (click)="copy('reference', p.reference)" [attr.aria-label]="'Copiar código ' + p.reference">
                      <app-icon [name]="copied() === 'reference' ? 'check' : 'copy'" [size]="15" />
                    </button>
                  </p>
                  <p class="mt-1.5 text-[14px] text-muted">Con el código encontramos tu pago sin pedirte otros datos.</p>
                </div>
              </li>
              <li class="flex gap-3">
                <span class="font-sans text-[20px] leading-6 font-bold text-brand" aria-hidden="true">3</span>
                <div class="min-w-0 flex-1">
                  <p class="font-semibold text-ink">Avisanos que transferiste</p>
                  @if (o.proofUploads) {
                    <label class="mt-2 block text-[14px] text-ink-soft" for="transfer-proof">Comprobante (opcional): PDF, JPG, PNG o WebP de hasta 10 MB.</label>
                    <input id="transfer-proof" type="file" class="mt-1.5 block w-full max-w-sm text-[14px] text-ink-soft file:mr-3 file:h-10 file:rounded-lg file:border file:border-line-btn file:bg-surface file:px-3 file:font-semibold file:text-ink" [accept]="accept" (change)="pick($event)" />
                  }
                  @if (progress() !== null) {
                    <p class="mt-2 text-[14px] text-muted" role="status">Subiendo comprobante… {{ progress() }}%</p>
                  }
                  <div class="mt-4 flex flex-wrap gap-2">
                    <button type="button" class="button-primary flex h-12 items-center gap-2 rounded-xl px-5 text-[15px] font-semibold disabled:opacity-60" [disabled]="store.busy()" [attr.aria-busy]="store.busy()" (click)="submit()" data-testid="transfer-submit">
                      @if (store.busy()) { <span class="size-4 animate-spin rounded-full border-[2.5px] border-white/35 border-t-white" aria-hidden="true"></span> }
                      Ya transferí
                    </button>
                    <button type="button" class="h-12 rounded-xl px-4 text-[15px] font-semibold text-ink-soft hover:bg-sand disabled:opacity-55" [disabled]="store.busy()" (click)="store.cancel()">Elegir otro período</button>
                  </div>
                </div>
              </li>
            </ol>
          } @else {
            <h2 id="transfer-title" class="mt-1 font-sans text-[22px] font-bold text-ink" data-testid="transfer-in-review">Estamos revisando tu transferencia</h2>
            <p class="mt-1.5 text-[15px] text-ink-soft">
              {{ amount(p.amountArs) }} · {{ months(p.months) }} · código <span class="font-semibold text-ink">{{ p.reference }}</span>.
              Te avisamos cuando la confirmemos; tu plan cambia recién ahí.
            </p>
            @if (p.proofUploaded) {
              <p class="mt-2 flex items-center gap-1.5 text-[14px] text-muted"><app-icon name="check" [size]="15" [stroke]="2.4" class="text-brand" />Recibimos tu comprobante.</p>
            } @else if (o.proofUploads) {
              <p class="mt-2 text-[14px] text-muted">Si tenés el comprobante, sumalo: nos ayuda a encontrar el pago.</p>
            }
            @if (o.proofUploads) {
              <label class="mt-3 block text-[14px] text-ink-soft" for="transfer-proof">{{ p.proofUploaded ? 'Reemplazar comprobante' : 'Comprobante' }}</label>
              <div class="mt-1.5 flex flex-wrap items-center gap-2">
                <input id="transfer-proof" type="file" class="block w-full max-w-sm text-[14px] text-ink-soft file:mr-3 file:h-10 file:rounded-lg file:border file:border-line-btn file:bg-surface file:px-3 file:font-semibold file:text-ink" [accept]="accept" (change)="pick($event)" />
                @if (file()) {
                  <button type="button" class="h-11 rounded-xl border border-line-btn px-4 text-[14.5px] font-semibold text-ink hover:bg-sand-light disabled:opacity-60" [disabled]="store.busy()" (click)="submit()">Enviar comprobante</button>
                }
              </div>
              @if (progress() !== null) {
                <p class="mt-2 text-[14px] text-muted" role="status">Subiendo comprobante… {{ progress() }}%</p>
              }
            }
          }
        } @else {
          @if (rejected(); as r) {
            <div class="mt-2 rounded-xl border border-line bg-sand-light px-4 py-3 text-[15px]" role="status" data-testid="transfer-rejected">
              <p class="font-semibold text-ink">No pudimos confirmar tu transferencia {{ r.reference }}.</p>
              @if (r.rejectionReason) { <p class="mt-1 text-ink-soft">{{ r.rejectionReason }}</p> }
              <p class="mt-1 text-[14px] text-muted">Si ya transferiste, volvé a pedirla con el mismo período y avisanos con el comprobante.</p>
            </div>
          }
          @if (o.options.length) {
            <h2 id="transfer-title" class="mt-1 font-sans text-[22px] font-bold text-ink">
              {{ proUntil() ? 'Renová por transferencia' : '¿Preferís transferir? Pagá por adelantado' }}
            </h2>
            <p class="mt-1.5 max-w-2xl text-[15px] text-ink-soft">
              Elegí cuántos meses pagar (de 30 días). No se renueva solo: te avisamos antes de que venza.
              @if (proUntil(); as u) { Los días se suman al final de tu PRO actual, que vence el {{ u }}. }
            </p>
            <fieldset class="mt-4">
              <legend class="sr-only">Período a pagar</legend>
              <div class="grid gap-2.5 sm:grid-cols-3">
                @for (opt of o.options; track opt.months) {
                  <label
                    class="flex cursor-pointer flex-col rounded-xl border px-4 py-3 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand"
                    [class]="selected() === opt.months ? 'border-brand bg-brand-tint' : 'border-line hover:bg-sand-light'"
                  >
                    <span class="flex items-center gap-2">
                      <input type="radio" name="transfer-months" class="size-4 accent-brand" [value]="opt.months" [checked]="selected() === opt.months" (change)="selected.set(opt.months)" />
                      <span class="font-semibold text-ink">{{ months(opt.months) }}</span>
                    </span>
                    <span class="mt-1 text-[20px] font-bold text-ink tabular-nums">{{ amount(opt.amountArs) }}</span>
                    @if (offerLine(opt); as line) {
                      <span class="text-[13.5px] text-accent-ink">{{ line }}</span>
                    }
                  </label>
                }
              </div>
            </fieldset>
            <button type="button" class="button-primary mt-4 flex h-12 items-center gap-2 rounded-xl px-5 text-[15px] font-semibold disabled:opacity-60" [disabled]="store.busy()" [attr.aria-busy]="store.busy()" (click)="store.request(selected())" data-testid="transfer-request">
              @if (store.busy()) { <span class="size-4 animate-spin rounded-full border-[2.5px] border-white/35 border-t-white" aria-hidden="true"></span> }
              Ver datos para transferir
            </button>
            <p class="mt-3 text-[14px] text-muted">
              Mismo precio que con Mercado Pago. PRO se activa cuando confirmamos el pago.
              <a routerLink="/terminos" fragment="pro-pagos" class="font-semibold text-brand underline underline-offset-2">Términos de Uso</a>
            </p>
          } @else if (!rejected()) {
            <h2 id="transfer-title" class="sr-only">Pago por transferencia</h2>
          }
        }

        @if (o.refundPending; as rp) {
          <p class="mt-4 text-[15px] font-semibold text-ink" data-testid="transfer-refund-pending">
            Revocaste un pago: te devolvemos {{ amount(rp.amountArs) }} por transferencia a la cuenta que nos indicaste.
          </p>
        }
        @if (o.withdrawal; as w) {
          <!-- Arrepentimiento (Ley 24.240, art. 34): visible mientras corre el plazo. -->
          <div class="mt-5 border-t border-line pt-4" data-testid="transfer-withdraw">
            <p class="text-[14px] text-ink-soft">¿Te arrepentiste? Podés revocar tu último pago hasta el {{ date(w.until) }}: te devolvemos {{ amount(w.amountArs) }} y quitamos esos días de PRO en el acto.</p>
            <button type="button" class="mt-2 min-h-11 rounded-lg text-[14.5px] font-semibold text-danger hover:underline" (click)="withdrawOpen.set(true)">Botón de arrepentimiento</button>
          </div>
        }
      </section>

      <app-dialog [open]="withdrawOpen()" labelledBy="transfer-withdraw-title" describedBy="transfer-withdraw-text" [dismissable]="!store.busy()" (dismiss)="withdrawOpen.set(false)">
        <h2 id="transfer-withdraw-title" class="font-sans text-[23px] font-bold tracking-[-0.02em]">Revocar tu pago por transferencia</h2>
        <div id="transfer-withdraw-text" class="mt-3 text-[15px] leading-[1.5] text-ink-soft">
          <p>Ejercés tu derecho de arrepentimiento, sin costo y sin explicar el motivo. Quitamos esos días de PRO ahora mismo y te devolvemos {{ o.withdrawal ? amount(o.withdrawal.amountArs) : '' }} por transferencia.</p>
          <p class="mt-2">Tu perfil, reseñas y datos no se eliminan.</p>
        </div>
        <label for="refund-to" class="mt-4 block text-[14.5px] font-semibold text-ink">¿A qué alias o CBU/CVU te lo devolvemos?</label>
        <input id="refund-to" type="text" autocomplete="off" spellcheck="false" maxlength="22" class="mt-1.5 h-12 w-full rounded-xl field-control px-3.5 text-base text-ink" [ngModel]="refundTo()" (ngModelChange)="refundTo.set($event.trim())" [attr.aria-invalid]="refundTo() && !refundValid() ? true : null" aria-describedby="refund-to-help" />
        <p id="refund-to-help" class="mt-1.5 text-[13.5px]" [class]="refundTo() && !refundValid() ? 'text-danger' : 'text-muted'">Alias (6 a 20 caracteres) o CBU/CVU de 22 dígitos.</p>
        <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" class="h-12 rounded-xl px-4 text-[15px] font-semibold text-ink-soft hover:bg-sand disabled:opacity-55" [disabled]="store.busy()" (click)="withdrawOpen.set(false)">Volver</button>
          <button type="button" class="flex h-12 items-center justify-center gap-2 rounded-xl bg-danger-fill px-5 text-[15px] font-semibold text-white disabled:opacity-60 press" [disabled]="store.busy() || !refundValid()" [attr.aria-busy]="store.busy()" (click)="withdraw()">
            @if (store.busy()) { <span class="size-4 animate-spin rounded-full border-[2.5px] border-white/35 border-t-white" aria-hidden="true"></span> }
            Revocar pago
          </button>
        </div>
      </app-dialog>
    }
  `,
  styles: `
    .copy-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.5rem;
      height: 2.5rem;
      flex-shrink: 0;
      border-radius: 0.6rem;
      color: var(--color-brand);
    }
    .copy-button:hover {
      background: var(--color-sand-light);
    }
  `,
})
export class ProTransferPanel {
  protected readonly store = inject(TransferStore);
  private readonly pro = inject(ProStore);
  protected readonly accept = PROOF_ACCEPT;

  protected readonly o = this.store.overview;
  protected readonly selected = signal<1 | 3 | 6>(1);
  protected readonly file = signal<File | null>(null);
  protected readonly copied = signal<string | null>(null);
  protected readonly withdrawOpen = signal(false);
  protected readonly refundTo = signal('');
  protected readonly refundValid = computed(() => REFUND_DESTINATION.test(this.refundTo()));
  protected readonly progress = this.store.uploadProgress;
  private copyTimer: ReturnType<typeof setTimeout> | undefined;

  /** Algo que mostrar: el pedido en curso, opciones para pagar, un rechazo, una devolución o el arrepentimiento. */
  protected readonly visible = computed(() => {
    const o = this.o();
    return !!o && o.available && (!!o.pending || o.options.length > 0 || !!this.rejected() || !!o.withdrawal || !!o.refundPending);
  });
  /** El último pago fue rechazado (y no hay otro en curso). */
  protected readonly rejected = computed<TransferPayment | null>(() => {
    const last = this.o()?.last;
    return last?.status === 'REJECTED' ? last : null;
  });
  /** Solo si el PRO vigente es por transferencia: los días nuevos van al final. */
  protected readonly proUntil = computed(() => {
    const iso = this.o()?.proUntil;
    return iso && this.pro.plan()?.source === 'TRANSFER' ? billingDate(iso, true) : null;
  });

  constructor() {
    void this.store.load();
  }

  protected amount = proPriceAmount;
  protected months = monthsText;
  protected date = (iso: string) => billingDate(iso, true);

  protected offerLine(opt: TransferOption): string | null {
    return opt.discountedFirstMonthArs !== null
      ? `Primer mes con oferta: ${proPriceAmount(opt.discountedFirstMonthArs)}`
      : null;
  }

  protected pick(event: Event): void {
    this.file.set((event.target as HTMLInputElement).files?.[0] ?? null);
  }

  protected async submit(): Promise<void> {
    if (await this.store.submit(this.file())) this.file.set(null);
  }

  protected async withdraw(): Promise<void> {
    if (await this.store.withdraw(this.refundTo())) {
      this.withdrawOpen.set(false);
      this.refundTo.set('');
    }
  }

  protected async copy(key: string, text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(key);
      clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copied.set(null), 2000);
    } catch {
      this.copied.set(null);
    }
  }
}
