import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { classifyError } from '../../../core/api/api-error';
import { AdminApiService } from '../../../core/api/admin-api.service';
import {
  AdminTransfer,
  AdminTransferAccount,
  AdminTransferDetail,
  AdminTransferList,
  AdminTransferStatus,
} from '../../../core/models/admin';
import { formatTimestamp } from '../../../core/utils/dates';
import { Dialog } from '../../../shared/components/dialog/dialog';
import { AdminHeader } from '../admin-header';

type View = 'IN_REVIEW' | 'AWAITING_PROOF' | 'WITHDRAWN' | 'ALL';

const VIEWS: { id: View; label: string }[] = [
  { id: 'IN_REVIEW', label: 'Para revisar' },
  { id: 'AWAITING_PROOF', label: 'Sin aviso' },
  { id: 'WITHDRAWN', label: 'Devoluciones' },
  { id: 'ALL', label: 'Todos' },
];

const STATUS_LABEL: Record<AdminTransferStatus, string> = {
  AWAITING_PROOF: 'Esperando aviso',
  IN_REVIEW: 'Para revisar',
  APPROVED: 'Confirmado',
  REJECTED: 'Rechazado',
  CANCELLED: 'Descartado',
  WITHDRAWN: 'Revocado',
};

export const PAYMENTS_MESSAGES = {
  loadFailed: 'No pudimos cargar los pagos.',
  invalidState: 'Ese pago ya cambió (lo resolvió otra persona o el profesional). Se actualizó la lista.',
  accountInvalid: 'Revisá los datos: alias de 6 a 20 caracteres, CBU/CVU de 22 dígitos válidos y CUIT de 11 dígitos.',
  failed: 'No pudimos completar la acción. Intentá de nuevo.',
} as const;

const ALIAS = /^[A-Za-z0-9.-]{6,20}$/;
const ars = (n: number) => `$${n.toLocaleString('es-AR')}`;
const months = (n: number) => (n === 1 ? '1 mes' : `${n} meses`);

/**
 * Pagos de PRO por transferencia (solo admin): revisar los avisos con el
 * código y el comprobante, confirmar (da PRO por los meses pagados) o
 * rechazar con un motivo que ve el profesional; marcar las devoluciones de
 * un arrepentimiento; y cargar los datos bancarios que se muestran en Mi plan.
 */
@Component({
  selector: 'app-admin-payments-page',
  imports: [AdminHeader, Dialog, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-admin-header current="pagos" />

    <main id="main" class="mx-auto max-w-4xl px-4 pt-6 pb-16 sm:px-6 sm:pt-8">
      <h1 class="font-display text-[30px] leading-tight font-bold tracking-[-0.02em] sm:text-[34px]">Pagos por transferencia</h1>
      <p class="mt-1.5 text-[15px] text-ink-soft">
        Buscá cada código en tu cuenta bancaria. Confirmar le da PRO por los meses pagados (se suman al final del PRO que ya tenga) y le avisa.
      </p>

      <!-- Datos bancarios: lo que ven los profesionales en Mi plan -->
      <section class="mt-6 rounded-2xl border border-line bg-surface p-5" aria-labelledby="account-title">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 id="account-title" class="text-[17px] font-bold">Datos para transferir</h2>
          @if (account(); as a) {
            <span class="rounded-md px-2 py-0.5 text-[13px] font-semibold" [class]="a.enabled ? 'bg-brand-soft text-brand-dark' : 'bg-neutral-soft text-neutral'" data-testid="account-state">
              {{ a.enabled ? 'Visible en Mi plan' : 'Apagado' }}
            </span>
          }
        </div>
        @if (!editing()) {
          @if (account(); as a) {
            <dl class="mt-3 grid gap-x-6 gap-y-2 text-[15px] sm:grid-cols-2">
              <div><dt class="text-[13.5px] text-muted">Titular</dt><dd class="font-semibold">{{ a.holder }}</dd></div>
              <div><dt class="text-[13.5px] text-muted">Alias</dt><dd class="font-semibold break-all">{{ a.alias }}</dd></div>
              @if (a.cbu) { <div><dt class="text-[13.5px] text-muted">CBU/CVU</dt><dd class="font-semibold break-all tabular-nums">{{ a.cbu }}</dd></div> }
              @if (a.bank) { <div><dt class="text-[13.5px] text-muted">Banco</dt><dd class="font-semibold">{{ a.bank }}</dd></div> }
              @if (a.cuit) { <div><dt class="text-[13.5px] text-muted">CUIT</dt><dd class="font-semibold tabular-nums">{{ a.cuit }}</dd></div> }
            </dl>
            <p class="mt-2 text-[13.5px] text-muted">Cambiado por {{ a.changedBy }} · {{ when(a.updatedAt) }}</p>
          } @else if (accountLoaded()) {
            <p class="mt-2 text-[14.5px] text-ink-soft" data-testid="no-account">
              Todavía no cargaste los datos: la opción de pagar por transferencia no aparece en Mi plan.
            </p>
          }
          <button type="button" class="mt-3 h-11 rounded-xl button-secondary px-4 text-[14.5px] font-semibold" (click)="startEdit()" data-testid="edit-account">
            {{ account() ? 'Cambiar datos' : 'Cargar datos' }}
          </button>
        } @else {
          <form class="mt-3 grid gap-3 sm:grid-cols-2" (submit)="$event.preventDefault(); saveAccount()">
            <div class="sm:col-span-2">
              <label for="acc-holder" class="block text-[14px] font-semibold">Titular</label>
              <input id="acc-holder" class="mt-1.5 h-11 w-full rounded-xl field-control px-3 text-base text-ink" maxlength="80" [value]="form().holder" (input)="set('holder', $event)" />
            </div>
            <div>
              <label for="acc-alias" class="block text-[14px] font-semibold">Alias</label>
              <input id="acc-alias" class="mt-1.5 h-11 w-full rounded-xl field-control px-3 text-base text-ink" maxlength="20" autocomplete="off" spellcheck="false" [value]="form().alias" (input)="set('alias', $event)" />
            </div>
            <div>
              <label for="acc-cbu" class="block text-[14px] font-semibold">CBU/CVU (opcional)</label>
              <input id="acc-cbu" class="mt-1.5 h-11 w-full rounded-xl field-control px-3 text-base text-ink tabular-nums" inputmode="numeric" maxlength="22" autocomplete="off" [value]="form().cbu" (input)="set('cbu', $event)" />
            </div>
            <div>
              <label for="acc-bank" class="block text-[14px] font-semibold">Banco (opcional)</label>
              <input id="acc-bank" class="mt-1.5 h-11 w-full rounded-xl field-control px-3 text-base text-ink" maxlength="60" [value]="form().bank" (input)="set('bank', $event)" />
            </div>
            <div>
              <label for="acc-cuit" class="block text-[14px] font-semibold">CUIT (opcional)</label>
              <input id="acc-cuit" class="mt-1.5 h-11 w-full rounded-xl field-control px-3 text-base text-ink tabular-nums" inputmode="numeric" maxlength="13" [value]="form().cuit" (input)="set('cuit', $event)" />
            </div>
            <label class="flex items-center gap-2.5 text-[15px] sm:col-span-2">
              <input type="checkbox" class="size-4.5 accent-brand" [checked]="form().enabled" (change)="toggleEnabled($event)" />
              Mostrar la opción de pagar por transferencia en Mi plan
            </label>
            @if (accountError()) {
              <p class="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[14px] font-medium text-danger sm:col-span-2" role="alert">{{ accountError() }}</p>
            }
            <div class="flex flex-wrap gap-2 sm:col-span-2">
              <button type="submit" class="button-primary h-11 rounded-xl px-5 text-[14.5px] font-semibold disabled:opacity-60" [disabled]="acting() || !formValid()" data-testid="save-account">Guardar</button>
              <button type="button" class="h-11 rounded-xl px-4 text-[14.5px] font-semibold text-ink-soft hover:bg-sand" (click)="editing.set(false)">Cancelar</button>
            </div>
          </form>
        }
      </section>

      <!-- Pagos -->
      <nav class="mt-7 flex gap-1 overflow-x-auto [scrollbar-width:none]" aria-label="Filtrar pagos">
        @for (v of views; track v.id) {
          <button
            type="button"
            class="flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[14.5px] font-semibold"
            [class]="view() === v.id ? 'bg-sand text-ink' : 'text-ink-soft hover:bg-sand'"
            [attr.aria-pressed]="view() === v.id"
            (click)="setView(v.id)"
          >
            {{ v.label }}
            @if (count(v.id); as c) { <span class="rounded-full bg-primary px-1.5 text-[12px] leading-5 font-bold text-white tabular-nums">{{ c }}</span> }
          </button>
        }
      </nav>

      @if (error()) {
        <div class="mt-4 rounded-2xl border border-line bg-surface p-5" role="alert">
          <p class="text-[15px] font-semibold">{{ error() }}</p>
          <button type="button" class="mt-3 h-11 rounded-xl button-secondary px-4 text-[14.5px] font-bold" (click)="load()">Reintentar</button>
        </div>
      } @else if (list(); as l) {
        @if (!l.items.length) {
          <p class="mt-4 rounded-2xl border border-line bg-surface p-5 text-[15px] text-ink-soft" data-testid="empty">No hay pagos en esta lista.</p>
        } @else {
          <ul class="mt-4 flex flex-col gap-3">
            @for (t of l.items; track t.id) {
              <li class="rounded-2xl border border-line bg-surface p-4 sm:p-5" [attr.data-testid]="'transfer-' + t.reference">
                <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                  <div class="min-w-0">
                    <p class="font-mono text-[16px] font-bold tracking-[0.04em]">{{ t.reference }}</p>
                    <p class="mt-0.5 text-[14.5px] text-ink-soft">
                      <a [routerLink]="['/admin/usuarios', t.professional.userId]" class="font-semibold text-ink hover:underline">{{ t.professional.name }}</a>
                      · <span class="break-all">{{ t.professional.email }}</span>
                    </p>
                  </div>
                  <span class="rounded-md bg-sand px-2 py-0.5 text-[13px] font-semibold text-ink-soft">{{ statusLabel(t) }}</span>
                </div>
                <p class="mt-2 text-[15px]">
                  <strong class="font-bold tabular-nums">{{ money(t.amountArs) }}</strong> · {{ monthsText(t.months) }}
                  @if (t.offerCode) { · con oferta de bienvenida }
                  @if (t.origin === 'ADMIN') { · anotado por un admin }
                </p>
                <p class="mt-1 text-[13.5px] text-muted">
                  Pedido {{ when(t.createdAt) }}
                  @if (t.status === 'IN_REVIEW') { · {{ t.hasProof ? 'con comprobante' : 'sin comprobante' }} }
                  @if (t.periodEnd && t.status === 'APPROVED') { · PRO hasta {{ when(t.periodEnd) }} }
                  @if (t.reviewerEmail) { · revisó {{ t.reviewerEmail }} }
                </p>
                @if (t.rejectionReason) { <p class="mt-1 text-[14px] text-ink-soft">Motivo: {{ t.rejectionReason }}</p> }
                @if (t.adminNote) { <p class="mt-1 text-[14px] text-ink-soft">Nota: {{ t.adminNote }}</p> }
                @if (t.status === 'WITHDRAWN') {
                  <p class="mt-2 text-[14.5px]" data-testid="refund-info">
                    @if (t.refundedAt) {
                      Devuelto el {{ when(t.refundedAt) }}.
                    } @else {
                      Devolver <strong class="font-semibold">{{ money(t.amountArs) }}</strong> a
                      <strong class="font-semibold break-all">{{ t.refundDestination }}</strong>.
                    }
                  </p>
                }

                <div class="mt-3 flex flex-wrap gap-2">
                  @if (t.hasProof) {
                    <button type="button" class="h-10 rounded-xl button-secondary px-3.5 text-[14px] font-semibold disabled:opacity-60" [disabled]="acting()" (click)="openProof(t)">Ver comprobante</button>
                  }
                  @if (t.status === 'IN_REVIEW' || t.status === 'AWAITING_PROOF') {
                    <button type="button" class="button-primary h-10 rounded-xl px-3.5 text-[14px] font-semibold" (click)="openDialog('approve', t)" [attr.data-testid]="'approve-' + t.reference">Confirmar pago</button>
                    <button type="button" class="h-10 rounded-xl px-3.5 text-[14px] font-semibold text-danger hover:bg-danger-soft" (click)="openDialog('reject', t)">Rechazar</button>
                  }
                  @if (t.status === 'WITHDRAWN' && !t.refundedAt) {
                    <button type="button" class="button-primary h-10 rounded-xl px-3.5 text-[14px] font-semibold disabled:opacity-60" [disabled]="acting()" (click)="markRefunded(t)">Ya lo devolví</button>
                  }
                </div>
              </li>
            }
          </ul>
        }
      } @else {
        <p class="mt-4 text-[15px] text-muted" role="status">Cargando pagos…</p>
      }
    </main>

    <app-dialog [open]="dialog() !== null" labelledBy="pay-dialog-title" describedBy="pay-dialog-text" [dismissable]="!acting()" (dismiss)="dialog.set(null)">
      @if (target(); as t) {
        @if (dialog() === 'approve') {
          <h2 id="pay-dialog-title" class="font-sans text-[23px] font-bold tracking-[-0.02em]">Confirmar {{ t.reference }}</h2>
          <p id="pay-dialog-text" class="mt-3 text-[15px] leading-[1.5] text-ink-soft">
            Confirmá solo si encontraste {{ money(t.amountArs) }} con este código en tu cuenta. {{ t.professional.name }} pasa a PRO por {{ monthsText(t.months) }} y le avisamos.
          </p>
          <label for="approve-note" class="mt-4 block text-[14px] font-semibold">Nota interna (opcional)</label>
          <input id="approve-note" class="mt-1.5 h-11 w-full rounded-xl field-control px-3 text-base text-ink" maxlength="300" placeholder="Banco, fecha…" [value]="note()" (input)="note.set($any($event.target).value)" />
        } @else {
          <h2 id="pay-dialog-title" class="font-sans text-[23px] font-bold tracking-[-0.02em]">Rechazar {{ t.reference }}</h2>
          <p id="pay-dialog-text" class="mt-3 text-[15px] leading-[1.5] text-ink-soft">El profesional ve este motivo en Mi plan. Su plan no cambia.</p>
          <label for="reject-reason" class="mt-4 block text-[14px] font-semibold">Motivo</label>
          <textarea id="reject-reason" rows="3" maxlength="300" class="mt-1.5 w-full rounded-xl field-control px-3 py-2.5 text-base text-ink" [value]="reason()" (input)="reason.set($any($event.target).value)"></textarea>
          <p class="mt-1 text-[13.5px] text-muted">Por ejemplo: "No encontramos una transferencia con ese código." (mínimo 5 caracteres)</p>
        }
        @if (actionError()) {
          <p class="mt-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[14px] font-medium text-danger" role="alert">{{ actionError() }}</p>
        }
        <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" class="h-12 rounded-xl px-4 text-[15px] font-semibold text-ink-soft hover:bg-sand disabled:opacity-55" [disabled]="acting()" (click)="dialog.set(null)">Volver</button>
          @if (dialog() === 'approve') {
            <button type="button" class="button-primary h-12 rounded-xl px-5 text-[15px] font-semibold disabled:opacity-60" [disabled]="acting()" (click)="approve(t)" data-testid="confirm-approve">Confirmar pago</button>
          } @else {
            <button type="button" class="h-12 rounded-xl bg-danger-fill px-5 text-[15px] font-semibold text-white disabled:opacity-60" [disabled]="acting() || reason().trim().length < 5" (click)="reject(t)">Rechazar</button>
          }
        </div>
      }
    </app-dialog>
  `,
})
export class AdminPaymentsPage implements OnInit {
  private readonly api = inject(AdminApiService);

  protected readonly views = VIEWS;
  protected readonly money = ars;
  protected readonly monthsText = months;
  protected readonly view = signal<View>('IN_REVIEW');
  protected readonly list = signal<AdminTransferList | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly acting = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly dialog = signal<'approve' | 'reject' | null>(null);
  protected readonly target = signal<AdminTransfer | null>(null);
  protected readonly note = signal('');
  protected readonly reason = signal('');

  protected readonly account = signal<AdminTransferAccount | null>(null);
  protected readonly accountLoaded = signal(false);
  protected readonly editing = signal(false);
  protected readonly accountError = signal<string | null>(null);
  protected readonly form = signal({ enabled: true, holder: '', alias: '', cbu: '', bank: '', cuit: '' });
  protected readonly formValid = computed(() => {
    const f = this.form();
    return (
      f.holder.trim().length >= 3 &&
      ALIAS.test(f.alias.trim()) &&
      (!f.cbu.trim() || /^\d{22}$/.test(f.cbu.trim())) &&
      (!f.cuit.trim() || /^\d{2}-?\d{8}-?\d$/.test(f.cuit.trim()))
    );
  });

  ngOnInit(): void {
    void this.load();
    void this.loadAccount();
  }

  protected count(v: View): number {
    const c = this.list()?.counts;
    if (!c) return 0;
    return v === 'IN_REVIEW' ? c.inReview : v === 'WITHDRAWN' ? c.refundsPending : 0;
  }

  protected statusLabel(t: AdminTransfer): string {
    if (t.status === 'WITHDRAWN') return t.refundedAt ? 'Revocado · devuelto' : 'Revocado · falta devolver';
    return STATUS_LABEL[t.status];
  }

  protected when(iso: string): string {
    return formatTimestamp(iso);
  }

  async load(): Promise<void> {
    try {
      const v = this.view();
      this.list.set(await firstValueFrom(this.api.transfers(v === 'ALL' ? null : v)));
      this.error.set(null);
    } catch {
      this.error.set(PAYMENTS_MESSAGES.loadFailed);
    }
  }

  protected setView(v: View): void {
    this.view.set(v);
    this.list.set(null);
    void this.load();
  }

  protected openDialog(kind: 'approve' | 'reject', t: AdminTransfer): void {
    this.target.set(t);
    this.note.set('');
    this.reason.set('');
    this.actionError.set(null);
    this.dialog.set(kind);
  }

  protected async openProof(t: AdminTransfer): Promise<void> {
    // El link vence en 10 minutos: se pide en el momento, nunca se guarda.
    const win = window.open('', '_blank', 'noopener');
    try {
      const detail: AdminTransferDetail = await firstValueFrom(this.api.transfer(t.id));
      if (detail.proofUrl && win) win.location.href = detail.proofUrl;
      else win?.close();
    } catch {
      win?.close();
    }
  }

  protected approve(t: AdminTransfer): Promise<void> {
    return this.act(() => firstValueFrom(this.api.approveTransfer(t.id, this.note().trim())));
  }

  protected reject(t: AdminTransfer): Promise<void> {
    return this.act(() => firstValueFrom(this.api.rejectTransfer(t.id, this.reason().trim())));
  }

  protected markRefunded(t: AdminTransfer): Promise<void> {
    return this.act(() => firstValueFrom(this.api.markTransferRefunded(t.id)));
  }

  private async act(call: () => Promise<unknown>): Promise<void> {
    if (this.acting()) return;
    this.acting.set(true);
    this.actionError.set(null);
    try {
      await call();
      this.dialog.set(null);
      await this.load();
    } catch (error) {
      const e = classifyError(error);
      if (e.code === 'TRANSFER_INVALID_STATE' || e.kind === 'not-found') {
        this.dialog.set(null);
        this.error.set(null);
        await this.load();
        this.actionError.set(PAYMENTS_MESSAGES.invalidState);
      } else {
        this.actionError.set(PAYMENTS_MESSAGES.failed);
      }
    } finally {
      this.acting.set(false);
    }
  }

  // ---- Datos bancarios -------------------------------------------------------

  private async loadAccount(): Promise<void> {
    try {
      this.account.set(await firstValueFrom(this.api.transferAccount()));
    } catch {
      this.account.set(null);
    } finally {
      this.accountLoaded.set(true);
    }
  }

  protected startEdit(): void {
    const a = this.account();
    this.form.set({
      enabled: a?.enabled ?? true,
      holder: a?.holder ?? '',
      alias: a?.alias ?? '',
      cbu: a?.cbu ?? '',
      bank: a?.bank ?? '',
      cuit: a?.cuit ?? '',
    });
    this.accountError.set(null);
    this.editing.set(true);
  }

  protected set(field: 'holder' | 'alias' | 'cbu' | 'bank' | 'cuit', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.form.update((f) => ({ ...f, [field]: value }));
  }

  protected toggleEnabled(event: Event): void {
    const enabled = (event.target as HTMLInputElement).checked;
    this.form.update((f) => ({ ...f, enabled }));
  }

  protected async saveAccount(): Promise<void> {
    if (this.acting() || !this.formValid()) return;
    this.acting.set(true);
    this.accountError.set(null);
    try {
      const f = this.form();
      this.account.set(
        await firstValueFrom(
          this.api.setTransferAccount({
            enabled: f.enabled,
            holder: f.holder.trim(),
            alias: f.alias.trim(),
            cbu: f.cbu.trim(),
            bank: f.bank.trim(),
            cuit: f.cuit.trim(),
          }),
        ),
      );
      this.editing.set(false);
    } catch (error) {
      this.accountError.set(classifyError(error).kind === 'validation' ? PAYMENTS_MESSAGES.accountInvalid : PAYMENTS_MESSAGES.failed);
    } finally {
      this.acting.set(false);
    }
  }
}
