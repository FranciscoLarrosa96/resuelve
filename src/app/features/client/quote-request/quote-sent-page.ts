import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RequestStore } from '../../../core/state/request.store';
import { joinNames } from '../../../core/utils/format';
import { Icon } from '../../../shared/components/icon/icon';

/**
 * Confirmación del pedido. Las solicitudes todavía no se envían al backend
 * (vertical siguiente): no se afirma que un profesional real ya la recibió.
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
      <h1 class="mt-6 font-display text-[40px] leading-[1.05] font-extrabold tracking-[-0.04em]">{{ title() }}</h1>
      <p class="mt-3 text-[17px] leading-[1.45] text-muted">{{ subtitle() }}</p>
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
        <h1 class="mt-6 font-display text-[30px] leading-[1.08] font-extrabold tracking-[-0.03em]">{{ title() }}</h1>
        <p class="mt-2.5 max-w-80 text-base leading-normal text-pretty text-ink-soft">{{ subtitle() }}</p>
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

  protected readonly title = computed(() => {
    const names = this.request.lastSent().map((p) => p.firstName);
    return names.length ? `Tu pedido para ${joinNames(names)} quedó guardado` : 'Tu pedido quedó guardado';
  });

  protected readonly subtitle = computed(
    () => 'Todavía no enviamos las solicitudes a los profesionales: lo vas a ver en Mis solicitudes.',
  );
}
