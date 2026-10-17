import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { classifyError } from '../../../core/api/api-error';
import { AdminApiService } from '../../../core/api/admin-api.service';
import { AdminWithdrawalRequest, AdminWithdrawalRequestList } from '../../../core/models/admin';

export const WITHDRAWAL_REQUEST_MESSAGES = {
  loadFailed: 'No pudimos cargar las solicitudes sin sesión.',
  expired: 'Esa solicitud llegó después de la ventana de ese pago: no se vincula sola. Decidí el caso fuera del sistema.',
  notFound: 'No encontramos un pago con ese código.',
  invalidState: 'Esa solicitud o ese pago ya cambió. Se actualizó la lista.',
  invalidInput: 'Revisá el código del pago (RES-XXXXXX) y el alias o CBU/CVU de devolución.',
  failed: 'No pudimos completar la acción. Intentá de nuevo.',
} as const;

const STATUS: Record<string, string> = {
  PENDING: 'Sin verificar',
  LINKED: 'Vinculada: falta resolver el pago',
  RESOLVED: 'Resuelta',
  DISMISSED: 'Descartada',
};

/**
 * Solicitudes de arrepentimiento recibidas SIN sesión ("No puedo ingresar a mi cuenta"). El admin verifica la
 * identidad por fuera (contactando a la persona) y las vincula con un pago: recién ahí quedan registradas sobre
 * ese pago, con la fecha ORIGINAL. Después se resuelven con "Resolver arrepentimiento" de siempre.
 */
@Component({
  selector: 'app-admin-withdrawal-requests',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (list(); as l) {
      @if (l.items.length) {
        <section class="mt-7 rounded-2xl border border-line bg-surface p-5" aria-labelledby="wr-title" data-testid="withdrawal-requests">
          <h2 id="wr-title" class="text-[17px] font-bold">Arrepentimientos sin sesión @if (l.counts.pending) { <span class="ml-1 rounded-md bg-brand-soft px-2 py-0.5 text-[13px] font-semibold text-brand-dark">{{ l.counts.pending }} sin verificar</span> }</h2>
          <p class="mt-1 text-[14px] text-ink-soft">
            Quien no pudo ingresar dejó estos datos. Verificá su identidad contactándola y vinculá la solicitud con el pago: queda registrada con la fecha original de recepción. Después usá “Resolver arrepentimiento” en ese pago.
          </p>
          @if (error()) { <p class="mt-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[14px] font-medium text-danger" role="alert">{{ error() }}</p> }
          <ul class="mt-3 space-y-3">
            @for (r of l.items; track r.id) {
              <li class="rounded-xl border border-line-soft p-4" data-testid="withdrawal-request">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="text-[15px] font-semibold"><span class="tabular-nums">{{ r.code }}</span> · {{ r.name }}</p>
                  <span class="rounded-md bg-neutral-soft px-2 py-0.5 text-[13px] font-semibold text-neutral">{{ statusLabel(r.status) }}</span>
                </div>
                <p class="mt-1 text-[14px] text-ink-soft">Recibida el {{ when(r.requestedAt) }} (hora de Argentina) · {{ r.email }}@if (r.phone) { · {{ r.phone }} }</p>
                @if (r.paymentReference) { <p class="mt-1 text-[14px] text-ink-soft">Dice tener el código <span class="font-semibold tabular-nums">{{ r.paymentReference }}</span> (sin verificar).</p> }
                @if (r.note) { <p class="mt-1 text-[14px] text-ink-soft">“{{ r.note }}”</p> }
                @if (r.adminNote) { <p class="mt-1 text-[14px] text-muted">Nota: {{ r.adminNote }}</p> }
                @if (r.status === 'PENDING') {
                  <form class="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]" (submit)="$event.preventDefault(); link(r)">
                    <input [attr.aria-label]="'Código del pago para ' + r.code" class="h-11 rounded-xl field-control px-3 text-base text-ink uppercase" placeholder="Código del pago RES-XXXXXX" maxlength="10" autocomplete="off" [value]="refOf(r)" (input)="setRef(r.id, $event)" />
                    <input [attr.aria-label]="'Alias o CBU de devolución para ' + r.code" class="h-11 rounded-xl field-control px-3 text-base text-ink" placeholder="Alias o CBU/CVU de devolución" maxlength="22" autocomplete="off" spellcheck="false" [value]="destOf(r)" (input)="setDest(r.id, $event)" />
                    <button type="submit" class="button-primary h-11 rounded-xl px-4 text-[14.5px] font-semibold disabled:opacity-60" [disabled]="busy()" data-testid="withdrawal-request-link">Vincular (identidad verificada)</button>
                  </form>
                  <button type="button" class="mt-2 min-h-10 rounded-lg text-[14px] font-semibold text-ink-soft hover:underline" [disabled]="busy()" (click)="dismiss(r)" data-testid="withdrawal-request-dismiss">Descartar (no se pudo verificar)</button>
                }
              </li>
            }
          </ul>
        </section>
      }
    }
  `,
})
export class AdminWithdrawalRequests implements OnInit {
  private readonly api = inject(AdminApiService);
  protected readonly list = signal<AdminWithdrawalRequestList | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  private readonly refs = signal<Record<string, string>>({});
  private readonly dests = signal<Record<string, string>>({});

  ngOnInit(): void {
    void this.load();
  }

  protected statusLabel(s: string): string {
    return STATUS[s] ?? s;
  }
  protected when(iso: string): string {
    return new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'medium', timeStyle: 'short' });
  }
  protected refOf(r: AdminWithdrawalRequest): string {
    return this.refs()[r.id] ?? r.paymentReference ?? '';
  }
  protected destOf(r: AdminWithdrawalRequest): string {
    return this.dests()[r.id] ?? '';
  }
  protected setRef(id: string, e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    this.refs.update((m) => ({ ...m, [id]: v }));
  }
  protected setDest(id: string, e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    this.dests.update((m) => ({ ...m, [id]: v }));
  }

  private async load(): Promise<void> {
    try {
      this.list.set(await firstValueFrom(this.api.withdrawalRequests(null)));
    } catch {
      this.error.set(WITHDRAWAL_REQUEST_MESSAGES.loadFailed);
    }
  }

  protected link(r: AdminWithdrawalRequest): Promise<void> {
    return this.act(() => firstValueFrom(this.api.linkWithdrawalRequest(r.id, this.refOf(r).trim().toUpperCase(), this.destOf(r).trim())));
  }
  protected dismiss(r: AdminWithdrawalRequest): Promise<void> {
    return this.act(() => firstValueFrom(this.api.dismissWithdrawalRequest(r.id, 'No se pudo verificar la identidad')));
  }

  private async act(fn: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await fn();
      await this.load();
    } catch (e) {
      const c = classifyError(e);
      this.error.set(
        c.code === 'TRANSFER_WITHDRAWAL_EXPIRED'
          ? WITHDRAWAL_REQUEST_MESSAGES.expired
          : c.kind === 'not-found'
            ? WITHDRAWAL_REQUEST_MESSAGES.notFound
            : c.kind === 'conflict'
              ? WITHDRAWAL_REQUEST_MESSAGES.invalidState
              : c.kind === 'validation'
                ? WITHDRAWAL_REQUEST_MESSAGES.invalidInput
                : WITHDRAWAL_REQUEST_MESSAGES.failed,
      );
      if (c.kind === 'conflict') await this.load();
    } finally {
      this.busy.set(false);
    }
  }
}
