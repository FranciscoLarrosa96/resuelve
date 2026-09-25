import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProfessionalsService } from '../../../core/services/professionals.service';
import { RequestStore } from '../../../core/state/request.store';
import { joinNames } from '../../../core/utils/format';
import { Icon } from '../../../shared/components/icon/icon';

/** Confirmación después de enviar la solicitud de presupuesto. */
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
      <h1 class="mt-6 font-display text-[40px] leading-[1.05] font-extrabold tracking-[-0.04em]">{{ title() }}</h1>
      <p class="mt-3 text-[17px] leading-[1.45] text-muted">{{ eta() }} Te avisamos por WhatsApp y en Mis solicitudes.</p>
      <div class="mt-7 flex justify-center gap-2.5">
        <a routerLink="/mis-solicitudes" class="flex h-13 items-center rounded-xl bg-brand px-5.5 text-[15.5px] font-semibold text-white hover:bg-brand-dark">Ver mis solicitudes</a>
        <a routerLink="/" class="flex h-13 items-center rounded-xl border border-line-btn bg-white px-5 text-[15.5px] font-semibold text-ink hover:bg-sand-light">Volver al inicio</a>
      </div>
    </div>

    <!-- MOBILE / TABLET -->
    <div class="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pb-[max(20px,env(safe-area-inset-bottom))] lg:hidden">
      <div class="flex flex-1 flex-col items-center justify-center pt-10 text-center">
        <div class="flex size-23 animate-pop items-center justify-center rounded-full bg-brand-soft">
          <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#1E5B4B" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7" stroke-dasharray="24" stroke-dashoffset="24" class="animate-draw" />
          </svg>
        </div>
        <h1 class="mt-6 font-display text-[30px] leading-[1.08] font-extrabold tracking-[-0.03em]">Solicitud enviada</h1>
        <p class="mt-2.5 max-w-75 text-base leading-normal text-pretty text-ink-soft">
          {{ title() }}<br />{{ subtitle() }}
        </p>
        <ol class="mt-7 w-full rounded-2xl border border-line bg-white px-4 py-1.5 text-left">
          <li class="flex items-center gap-3 border-b border-line-soft py-3">
            <span class="flex size-6.5 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">1</span>
            <span class="text-[14.5px] font-medium">Revisa tu pedido y las fotos</span>
          </li>
          <li class="flex items-center gap-3 border-b border-line-soft py-3">
            <span class="flex size-6.5 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">2</span>
            <span class="text-[14.5px] font-medium">Te envía un presupuesto por acá</span>
          </li>
          <li class="flex items-center gap-3 py-3">
            <span class="flex size-6.5 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">3</span>
            <span class="text-[14.5px] font-medium">Si lo aceptás, coordinan la visita</span>
          </li>
        </ol>
      </div>
      <div class="mt-6 flex flex-col gap-2">
        <a routerLink="/mis-solicitudes" class="flex h-14 items-center justify-center rounded-xl bg-brand text-[16.5px] font-semibold text-white">Ver mis solicitudes</a>
        <a routerLink="/profesionales" class="flex h-13 items-center justify-center rounded-xl border border-line-btn bg-white text-[15.5px] font-semibold text-ink">Buscar otro profesional</a>
      </div>
    </div>
  `,
})
export class QuoteSentPage {
  private readonly request = inject(RequestStore);
  private readonly pros = inject(ProfessionalsService);

  private readonly recipients = computed(() => this.pros.many(this.request.lastSentIds()));
  private readonly fastest = computed(
    () => [...this.recipients()].sort((a, b) => a.responseMinutes - b.responseMinutes)[0],
  );

  protected readonly title = computed(() => {
    const names = this.recipients().map((p) => p.firstName);
    if (!names.length) return 'Tu solicitud fue enviada.';
    return `${joinNames(names)} ${names.length === 1 ? 'recibió' : 'recibieron'} tu solicitud.`;
  });

  protected readonly eta = computed(() => {
    const f = this.fastest();
    return f ? `La primera respuesta suele llegar en ${f.responseTime.replace('~', '')}.` : '';
  });

  protected readonly subtitle = computed(() => {
    const f = this.fastest();
    if (!f) return 'Te avisamos cuando llegue el primer presupuesto.';
    return this.recipients().length === 1
      ? `Normalmente responde en ${f.responseTimeLong}.`
      : `La primera respuesta suele llegar en ${f.responseTimeLong}.`;
  });
}
