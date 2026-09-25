import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CITY, CLIENT_USER } from '../../../core/data/catalog.data';
import { ToastService } from '../../../core/services/toast.service';
import { ClientRequestsStore } from '../../../core/state/client-requests.store';
import { Icon } from '../../../shared/components/icon/icon';

@Component({
  selector: 'app-client-profile-page',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-2xl animate-fade-in px-4 pt-5.5 pb-6 lg:max-w-3xl lg:px-8 lg:pt-12 lg:pb-18">
      <div class="flex items-center gap-3.5 px-1">
        <div
          class="flex size-15 items-center justify-center rounded-2xl bg-[#F6E3D3] font-display text-xl font-bold text-[#8A4A1E] lg:size-20 lg:rounded-3xl lg:text-2xl"
          aria-hidden="true"
        >{{ user.initials }}</div>
        <div>
          <h1 class="font-display text-[22px] font-bold lg:text-[34px] lg:font-extrabold lg:tracking-[-0.035em]">{{ user.name }}</h1>
          <div class="text-sm text-muted lg:text-base">{{ user.zone }}, {{ city }}</div>
        </div>
      </div>

      <div class="mt-5.5 grid gap-3.5 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start lg:gap-5">
        <ul class="overflow-hidden rounded-2xl border border-line bg-white">
          @for (item of items; track item.label) {
            <li class="border-b border-line-soft last:border-b-0">
              @if (item.link) {
                <a [routerLink]="item.link" class="flex items-center gap-3 px-4 py-3.75 text-[15px] font-medium hover:bg-cream">
                  <span class="flex-1">{{ item.label }}</span>
                  @if (item.link === '/mis-solicitudes' && pending()) {
                    <span class="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-white">{{ pending() }}</span>
                  }
                  <app-icon name="chevron-right" [stroke]="2.4" class="text-subtle" />
                </a>
              } @else {
                <button type="button" class="flex w-full items-center gap-3 px-4 py-3.75 text-left text-[15px] font-medium hover:bg-cream" (click)="soon(item.label)">
                  <span class="flex-1">{{ item.label }}</span>
                  <app-icon name="chevron-right" [stroke]="2.4" class="text-subtle" />
                </button>
              }
            </li>
          }
        </ul>

        <div class="rounded-2xl bg-brand p-4.5 text-white">
          <h2 class="text-base font-semibold">¿Ofrecés un servicio?</h2>
          <p class="mt-1 text-sm leading-[1.45] text-on-brand">Pasá al modo profesional con la misma cuenta.</p>
          <a routerLink="/pro" class="mt-3.5 inline-flex h-11.5 items-center rounded-xl bg-white px-4.5 text-[14.5px] font-semibold text-brand">
            Ir al modo profesional
          </a>
        </div>
      </div>
    </div>
  `,
})
export class ClientProfilePage {
  private readonly toast = inject(ToastService);
  protected readonly pending = inject(ClientRequestsStore).pendingActions;
  protected readonly user = CLIENT_USER;
  protected readonly city = CITY;

  protected readonly items: { label: string; link?: string }[] = [
    { label: 'Mis datos' },
    { label: 'Mis solicitudes', link: '/mis-solicitudes' },
    { label: 'Direcciones guardadas' },
    { label: 'Profesionales guardados' },
    { label: 'Notificaciones' },
  ];

  protected soon(label: string): void {
    this.toast.show(`“${label}” estará disponible próximamente`);
  }
}
