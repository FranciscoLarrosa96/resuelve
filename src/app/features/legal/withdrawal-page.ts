import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/state/auth.store';
import { LEGAL_PAGE_STYLES } from './legal-page.styles';

const DESCRIPTION =
  'Cómo arrepentirte de la contratación de Resuelve PRO: botón visible, plazo, devolución y qué verificamos antes de modificar un pago.';

/** Dónde está el trámite (único lugar que modifica pagos o acceso): Mi plan, con la sesión ya iniciada. */
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
          <p class="mt-2 text-[15px] leading-relaxed text-ink-soft">Para proteger tus pagos, primero verificamos que sos quien contrató: ingresá con tu cuenta y seguís directo al trámite. Esta página no muestra ni modifica ningún pago.</p>
          <a routerLink="/ingresar" [queryParams]="{ returnUrl: returnUrl }" class="mt-4 inline-flex h-12 items-center justify-center rounded-xl bg-primary px-5 text-[15px] font-semibold text-white" data-testid="withdrawal-go">Ingresar para continuar</a>
        }
      </section>

      <article class="legal">
        <section class="mt-10" aria-labelledby="wd-plazo">
          <h2 id="wd-plazo" class="font-display text-[26px] font-bold tracking-[-0.015em] text-ink">Plazo</h2>
          <p>Tenés <strong>10 días corridos</strong>. Por transferencia, contamos desde que <strong>confirmamos cada pago</strong>; cada pago tiene su propio plazo. Se mide contra el momento en que hacés la solicitud.</p>
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
          <p>Solo verificamos tu identidad con los medios que ya usás (tu cuenta) y únicamente para que nadie más pueda modificar tus pagos o tu acceso. No pedimos más datos que el alias o CBU donde devolverte el dinero.</p>
        </section>
      </article>
    </div>
  `,
})
export class WithdrawalPage {
  protected readonly auth = inject(AuthStore);
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
