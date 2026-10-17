import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { classifyError } from '../../core/api/api-error';
import { TransferApiService } from '../../core/api/transfer-api.service';
import { WithdrawalRequestReceipt } from '../../core/models/transfer';
import { AuthStore } from '../../core/state/auth.store';
import { LEGAL_PAGE_STYLES } from './legal-page.styles';

const DESCRIPTION =
  'Cómo arrepentirte de la contratación de Resuelve PRO: botón visible, plazo, devolución y qué verificamos antes de modificar un pago.';

/** Dónde está el trámite (único lugar que modifica pagos o acceso): Mi plan, con la sesión ya iniciada. */
export const WITHDRAWAL_REQUEST_MESSAGES = {
  limit: 'Ya recibimos varias solicitudes con estos datos. Vamos a contactarte; si es urgente, intentá de nuevo más tarde.',
  invalid: 'Revisá los datos: nombre, correo válido y, si lo completás, el código con formato RES-XXXXXX.',
  failed: 'No pudimos registrar tu solicitud. Intentá de nuevo en unos minutos.',
} as const;

const RESES = /^RES-[A-Za-z0-9]{6}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const WITHDRAWAL_FLOW_URL = '/pro/plan';
export const WITHDRAWAL_FLOW_FRAGMENT = 'arrepentimiento';

/**
 * Acceso público y visible al trámite de arrepentimiento (`/arrepentimiento`, prerenderizada, enlazada
 * desde el pie de todas las pantallas y desde los Términos). NO muestra datos de pagos ni permite
 * revocar nada: el trámite real es el que ya existe en Mi plan, y antes de modificar un pago o el
 * acceso se verifica la identidad con la sesión de la cuenta que contrató.
 */
@Component({
  selector: 'app-withdrawal-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: LEGAL_PAGE_STYLES,
  template: `
    <div class="mx-auto max-w-3xl animate-fade-in px-4 pt-6 pb-20 sm:px-5 lg:pt-12">
      <a routerLink="/" class="plain text-sm font-semibold text-brand hover:underline">← Volver a Resuelve</a>
      <header class="mt-5">
        <p class="text-sm font-semibold tracking-[0.14em] text-brand uppercase">Resuelve PRO</p>
        <h1 class="mt-2 font-display text-[34px] leading-[1.1] font-bold tracking-[-0.02em] text-ink md:text-[44px]">Botón de arrepentimiento</h1>
        <p class="mt-3 max-w-2xl text-[17px] leading-relaxed text-ink-soft">
          Si contrataste Resuelve PRO (o PRO Plus) y te arrepentiste, podés revocar la contratación sin costo y sin dar explicaciones, dentro del plazo.
        </p>
      </header>

      <section class="mt-8 rounded-2xl border border-line bg-surface p-5" aria-labelledby="wd-start" data-testid="withdrawal-start">
        <h2 id="wd-start" class="font-display text-[22px] font-bold tracking-[-0.015em] text-ink">Empezar el trámite</h2>
        @if (auth.authenticated()) {
          <p class="mt-2 text-[15px] leading-relaxed text-ink-soft">Ya iniciaste sesión. El trámite está en Mi plan, junto a cada pago con plazo abierto.</p>
          <a routerLink="/pro/plan" fragment="arrepentimiento" class="mt-4 inline-flex h-12 items-center justify-center rounded-xl bg-primary px-5 text-[15px] font-semibold text-white" data-testid="withdrawal-go">Ir a mi plan</a>
        } @else {
          <p class="mt-2 text-[15px] leading-relaxed text-ink-soft">Para proteger tus pagos, primero verificamos que sos quien contrató: ingresá con tu cuenta y seguís directo al trámite. Esta página no muestra ni modifica ningún pago. ¿No podés ingresar? Usá “No puedo ingresar a mi cuenta”, más abajo.</p>
          <a routerLink="/ingresar" [queryParams]="{ returnUrl: returnUrl }" class="mt-4 inline-flex h-12 items-center justify-center rounded-xl bg-primary px-5 text-[15px] font-semibold text-white" data-testid="withdrawal-go">Ingresar para continuar</a>
        }
      </section>

      <!-- Sin sesión: registra la solicitud con fecha y hora del servidor; no revela ni modifica nada. -->
      <section class="mt-6 rounded-2xl border border-line p-5" aria-labelledby="wd-nologin" data-testid="withdrawal-nologin">
        <h2 id="wd-nologin" class="font-display text-[22px] font-bold tracking-[-0.015em] text-ink">No puedo ingresar a mi cuenta</h2>
        @if (receipt(); as r) {
          <div class="mt-3" role="status" data-testid="withdrawal-receipt">
            <p class="text-[15px] font-semibold text-ink">Recibimos tu solicitud.</p>
            <dl class="mt-3 grid gap-x-6 gap-y-2 text-[15px] sm:grid-cols-2">
              <div><dt class="text-[13.5px] text-muted">Código de solicitud</dt><dd class="font-semibold tabular-nums" data-testid="withdrawal-code">{{ r.code }}</dd></div>
              <div><dt class="text-[13.5px] text-muted">Fecha y hora de recepción</dt><dd class="font-semibold">{{ receivedAt() }} (hora de Argentina)</dd></div>
            </dl>
            <p class="mt-3 text-[15px] leading-relaxed text-ink-soft">
              Guardá este código. <strong class="font-semibold text-ink">Todavía no revocamos ningún pago ni hicimos ninguna devolución:</strong>
              el equipo va a verificar tu identidad por el correo o teléfono que nos dejaste y, recién entonces, va a vincular tu solicitud con la contratación.
              La fecha de recepción es la que cuenta para evaluar el plazo, aunque la verificación termine después. Tu acceso no cambia hasta entonces.
            </p>
          </div>
        } @else {
          <p class="mt-2 text-[15px] leading-relaxed text-ink-soft">
            Dejanos estos datos y registramos tu solicitud con la fecha y hora de hoy. No confirmamos ni mostramos nada sobre cuentas o pagos: el equipo te contacta para verificar tu identidad.
          </p>
          <form class="mt-4 grid gap-3 sm:grid-cols-2" (submit)="$event.preventDefault(); send()" novalidate>
            <div>
              <label for="wd-name" class="block text-[14px] font-semibold">Nombre y apellido</label>
              <input id="wd-name" class="mt-1.5 h-11 w-full rounded-xl field-control px-3 text-base text-ink" maxlength="120" autocomplete="name" [value]="form().name" (input)="set('name', $event)" />
            </div>
            <div>
              <label for="wd-email" class="block text-[14px] font-semibold">Correo para contactarte</label>
              <input id="wd-email" type="email" class="mt-1.5 h-11 w-full rounded-xl field-control px-3 text-base text-ink" maxlength="254" autocomplete="email" [value]="form().email" (input)="set('email', $event)" />
            </div>
            <div>
              <label for="wd-phone" class="block text-[14px] font-semibold">Teléfono (opcional)</label>
              <input id="wd-phone" type="tel" class="mt-1.5 h-11 w-full rounded-xl field-control px-3 text-base text-ink" maxlength="30" autocomplete="tel" [value]="form().phone" (input)="set('phone', $event)" />
            </div>
            <div>
              <label for="wd-ref" class="block text-[14px] font-semibold">Código del pago (opcional)</label>
              <input id="wd-ref" class="mt-1.5 h-11 w-full rounded-xl field-control px-3 text-base text-ink uppercase" maxlength="10" placeholder="RES-XXXXXX" autocomplete="off" spellcheck="false" [value]="form().paymentReference" (input)="set('paymentReference', $event)" />
            </div>
            <div class="sm:col-span-2">
              <label for="wd-note" class="block text-[14px] font-semibold">Lo que recordás del pago (opcional)</label>
              <textarea id="wd-note" rows="3" class="mt-1.5 w-full rounded-xl field-control px-3 py-2.5 text-base text-ink" maxlength="500" placeholder="Fecha, monto, plan o el correo de la cuenta" [value]="form().note" (input)="set('note', $event)"></textarea>
            </div>
            <label class="flex items-start gap-2.5 text-[14.5px] text-ink-soft sm:col-span-2">
              <input type="checkbox" class="mt-0.5 size-4.5 accent-brand" [checked]="form().consent" (change)="toggleConsent($event)" />
              <span>Acepto que Resuelve use estos datos solo para verificar mi identidad, ubicar la contratación y contactarme por este trámite.</span>
            </label>
            @if (error()) {
              <p class="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[14px] font-medium text-danger sm:col-span-2" role="alert" data-testid="withdrawal-error">{{ error() }}</p>
            }
            <div class="sm:col-span-2">
              <button type="submit" class="button-primary h-12 rounded-xl px-5 text-[15px] font-semibold disabled:opacity-60" [disabled]="sending() || !valid()" data-testid="withdrawal-send">
                {{ sending() ? 'Enviando…' : 'Enviar solicitud' }}
              </button>
            </div>
          </form>
        }
      </section>

      <article class="legal">
        <section class="mt-10" aria-labelledby="wd-plazo">
          <h2 id="wd-plazo" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Plazo</h2>
          <p>Por transferencia, como beneficio de nuestras condiciones, podés pedir la devolución de <strong>cada pago desde que lo confirmamos y hasta 10 días corridos después de que empieza el período que pagaste</strong>. Si el período empieza al confirmar, son 10 días desde la confirmación. Si empieza después (por ejemplo, PRO Plus que empieza cuando termina tu PRO), podés pedirlo antes de que empiece y hasta 10 días después de su inicio. Cada pago tiene su propio plazo y se mide contra el momento en que hacés la solicitud. Estas condiciones no limitan los derechos que te correspondan por ley.</p>
        </section>
        <section class="mt-10" aria-labelledby="wd-que">
          <h2 id="wd-que" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Qué pasa cuando lo pedís</h2>
          <ul>
            <li>Te mostramos en el momento un <strong>código de arrepentimiento</strong> (es el código del pago) y lo guardamos con la fecha y hora de tu pedido.</li>
            <li>Te devolvemos el <strong>total</strong> del pago, por el mismo medio. Por transferencia lo hacemos nosotros, a mano, a la cuenta que nos indiques.</li>
            <li>Si hay otros pagos tuyos posteriores que dependen de ese, el pedido queda registrado con su fecha y lo resolvemos nosotros; mientras tanto tu acceso no cambia y no anulamos ningún otro pago por nuestra cuenta.</li>
          </ul>
          <p>El detalle completo está en los <a routerLink="/terminos" fragment="pro-pagos">Términos de Uso</a>.</p>
        </section>
        <section class="mt-10" aria-labelledby="wd-ident">
          <h2 id="wd-ident" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Qué verificamos y por qué</h2>
          <p>Solo verificamos tu identidad para que nadie más pueda modificar tus pagos o tu acceso: con tu cuenta, si podés ingresar, o con una verificación del equipo si usás “No puedo ingresar a mi cuenta”. No pedimos más datos que los necesarios para localizar la contratación, contactarte y el alias o CBU donde devolverte el dinero. Registrar la solicitud no revoca ni devuelve nada por sí solo.</p>
        </section>
      </article>
    </div>
  `,
})
export class WithdrawalPage {
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(TransferApiService);
  protected readonly form = signal({ name: '', email: '', phone: '', paymentReference: '', note: '', consent: false });
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly receipt = signal<WithdrawalRequestReceipt | null>(null);
  protected readonly valid = computed(() => {
    const f = this.form();
    return (
      f.name.trim().length >= 2 &&
      EMAIL.test(f.email.trim()) &&
      (!f.paymentReference.trim() || RESES.test(f.paymentReference.trim())) &&
      f.consent
    );
  });
  protected readonly receivedAt = computed(() => {
    const r = this.receipt();
    return r
      ? new Date(r.requestedAt).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'long', timeStyle: 'short' })
      : '';
  });

  protected set(field: 'name' | 'email' | 'phone' | 'paymentReference' | 'note', event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.form.update((f) => ({ ...f, [field]: value }));
  }
  protected toggleConsent(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.form.update((f) => ({ ...f, consent: checked }));
  }

  protected async send(): Promise<void> {
    if (this.sending() || !this.valid()) return;
    this.sending.set(true);
    this.error.set(null);
    const f = this.form();
    try {
      this.receipt.set(
        await firstValueFrom(
          this.api.submitWithdrawalRequest({
            name: f.name.trim(),
            email: f.email.trim(),
            phone: f.phone.trim() || undefined,
            paymentReference: f.paymentReference.trim().toUpperCase() || undefined,
            note: f.note.trim() || undefined,
            consent: true,
          }),
        ),
      );
    } catch (e) {
      const c = classifyError(e);
      this.error.set(
        c.code === 'WITHDRAWAL_REQUEST_LIMIT' || c.kind === 'rate-limited'
          ? WITHDRAWAL_REQUEST_MESSAGES.limit
          : c.kind === 'validation'
            ? WITHDRAWAL_REQUEST_MESSAGES.invalid
            : WITHDRAWAL_REQUEST_MESSAGES.failed,
      );
    } finally {
      this.sending.set(false);
    }
  }

  protected readonly returnUrl = `${WITHDRAWAL_FLOW_URL}#${WITHDRAWAL_FLOW_FRAGMENT}`;

  constructor() {
    const meta = inject(Meta);
    const previous = meta.getTag('name="description"')?.content ?? null;
    meta.updateTag({ name: 'description', content: DESCRIPTION });
    inject(DestroyRef).onDestroy(() => {
      if (previous) meta.updateTag({ name: 'description', content: previous });
    });
  }
}
