import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RequestStore } from '../../../core/state/request.store';
import { requestStatusLabel } from '../../../core/models/request-status';
import { joinNames, pluralize } from '../../../core/utils/format';
import { Icon } from '../../../shared/components/icon/icon';

/**
 * Confirmación del pedido. Usa la respuesta REAL del backend (RequestStore.lastCreated):
 * solo dice "enviada" si hay invitaciones confirmadas.
 */
@Component({
  selector: 'app-quote-sent-page',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- DESKTOP -->
    <div class="mx-auto mt-12 hidden max-w-160 animate-up px-8 pb-18 text-center lg:block">
      <div class="mx-auto flex size-21 animate-pop items-center justify-center rounded-full bg-brand text-white">
        <app-icon name="check" [size]="40" [stroke]="3" />
      </div>
      <h1 class="mt-6 font-display text-[40px] leading-[1.05] font-bold tracking-[-0.025em]">{{ title() }}</h1>
      <p class="mt-3 text-[17px] leading-[1.45] text-muted">{{ subtitle() }}</p>
      @if (sent(); as s) {
        <dl class="mx-auto mt-6 grid max-w-100 grid-cols-[110px_1fr] gap-x-4 gap-y-2 rounded-2xl border border-line bg-white px-5 py-4 text-left text-[14.5px]">
          <dt class="text-muted">Solicitud</dt><dd class="font-semibold tabular-nums">#{{ s.code }}</dd>
          <dt class="text-muted">Servicio</dt><dd class="font-semibold">{{ s.service }}</dd>
          <dt class="text-muted">Estado</dt><dd class="font-semibold">{{ s.status }}</dd>
        </dl>
      }
      <div class="mt-7 flex justify-center gap-2.5">
        <a [routerLink]="sent() ? ['/mis-solicitudes', sent()!.id] : '/mis-solicitudes'" class="flex h-13 items-center rounded-xl bg-brand px-5.5 text-[15.5px] font-semibold text-white hover:bg-brand-dark press">{{ sent() ? 'Ver solicitud' : 'Ver mis solicitudes' }}</a>
        <a routerLink="/" class="flex h-13 items-center rounded-xl border border-line-btn bg-white px-5 text-[15.5px] font-semibold text-ink hover:bg-sand-light press">Volver al inicio</a>
      </div>
    </div>

    <!-- MOBILE / TABLET -->
    <div class="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pb-[max(20px,env(safe-area-inset-bottom))] lg:hidden">
      <div class="flex flex-1 flex-col items-center justify-center pt-10 text-center">
        <div class="flex size-23 animate-pop items-center justify-center rounded-full bg-brand-soft">
          <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#1A5C4D" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7" stroke-dasharray="24" stroke-dashoffset="24" class="animate-draw" />
          </svg>
        </div>
        <h1 class="mt-6 font-display text-[30px] leading-[1.08] font-bold tracking-[-0.02em]">{{ title() }}</h1>
        <p class="mt-2.5 max-w-80 text-base leading-normal text-pretty text-ink-soft">{{ subtitle() }}</p>
        @if (sent(); as s) {
          <p class="mt-4 rounded-xl bg-white px-4 py-2.5 text-[13.5px] text-muted">#{{ s.code }} · {{ s.service }} · {{ s.status }}</p>
        }
      </div>
      <div class="mt-6 flex flex-col gap-2">
        <a [routerLink]="sent() ? ['/mis-solicitudes', sent()!.id] : '/mis-solicitudes'" class="flex h-14 items-center justify-center rounded-xl bg-brand text-[16.5px] font-semibold text-white press">{{ sent() ? 'Ver solicitud' : 'Ver mis solicitudes' }}</a>
        <a routerLink="/profesionales" class="flex h-13 items-center justify-center rounded-xl border border-line-btn bg-white text-[15.5px] font-semibold text-ink press">Buscar otro profesional</a>
      </div>
    </div>
  `,
})
export class QuoteSentPage {
  private readonly request = inject(RequestStore);

  /** Solo lo que devolvió el backend. Sin respuesta (p. ej. tras un F5) no se afirma nada. */
  protected readonly sent = computed(() => {
    const r = this.request.lastCreated();
    if (!r) return null;
    const names = r.invitations.map((i) => i.professional?.displayName.split(' ')[0] ?? 'Profesional');
    return {
      id: r.id,
      /** Número corto para reconocerla (los primeros caracteres del id real). */
      code: r.id.slice(0, 8).toUpperCase(),
      service: r.service.name ?? '',
      status: requestStatusLabel(r.status),
      invited: r.invitations.length,
      names: joinNames(names),
    };
  });

  protected readonly title = computed(() => {
    const s = this.sent();
    if (!s) return 'Revisá tus solicitudes';
    return s.invited ? 'Tu solicitud fue enviada' : 'Tu solicitud quedó guardada';
  });

  protected readonly subtitle = computed(() => {
    const s = this.sent();
    if (!s) return 'Ahí vas a ver el estado real de cada pedido.';
    if (!s.invited) return 'Todavía no se la pediste a ningún profesional.';
    return `La recibió ${s.invited === 1 ? s.names : `${pluralize(s.invited, 'profesional', 'profesionales')}: ${s.names}`}. Cuando respondan, vas a ver los presupuestos en Mis solicitudes.`;
  });
}
