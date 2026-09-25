import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CITY, CLIENT_USER } from '../../core/data/catalog.data';
import { CurrentRoute } from '../../core/services/current-route.service';
import { ClientRequestsStore } from '../../core/state/client-requests.store';
import { Icon } from '../../shared/components/icon/icon';
import { Logo } from '../../shared/components/logo/logo';

interface NavItem {
  label: string;
  link: string;
  activeOn: string[];
}

/** Header desktop del cliente (≥ lg). */
@Component({
  selector: 'app-client-header',
  imports: [RouterLink, Logo, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="sticky top-0 z-20 border-b border-track bg-canvas/95 backdrop-blur-md">
      <div class="mx-auto flex h-[68px] max-w-[1320px] items-center gap-2.5 overflow-hidden px-5 xl:gap-5 xl:px-8">
        <a routerLink="/" class="shrink-0 rounded-lg" aria-label="Resuelve, inicio">
          <app-logo size="lg" />
        </a>
        <button
          type="button"
          class="hidden shrink-0 items-center gap-1.5 rounded-full border border-line-input bg-white px-3 py-[7px] text-[13.5px] font-medium whitespace-nowrap text-ink xl:flex"
        >
          <app-icon name="pin" [size]="14" class="text-brand" />{{ city }} · {{ user.zone }}
        </button>
        <nav class="ml-1 flex shrink-0 gap-1" aria-label="Principal">
          @for (item of nav; track item.link) {
            <a
              [routerLink]="item.link"
              class="rounded-[10px] px-3 py-[9px] text-sm font-semibold whitespace-nowrap transition-colors hover:bg-sand-dark"
              [class]="isActive(item) ? 'bg-sand-dark text-ink' : 'text-muted'"
              [attr.aria-current]="isActive(item) ? 'page' : null"
            >{{ item.label }}</a>
          }
        </nav>
        <div class="min-w-0 flex-1"></div>
        @if (pending() > 0) {
          <a
            routerLink="/mis-solicitudes"
            class="flex shrink-0 items-center gap-2 rounded-full bg-accent-soft px-[13px] py-2 text-[13px] font-semibold whitespace-nowrap text-accent-ink"
          >
            <span class="size-2 rounded-full bg-accent" aria-hidden="true"></span>
            <span class="xl:hidden">{{ pending() }} te esperan</span>
            <span class="hidden xl:inline">{{ pending() }} pedidos esperan tu respuesta</span>
          </a>
        }
        <a
          routerLink="/pro"
          class="shrink-0 rounded-xl border border-line-btn px-3.5 py-[9px] text-sm font-semibold whitespace-nowrap text-ink transition-colors hover:bg-white"
        >
          <span class="xl:hidden">Soy pro</span><span class="hidden xl:inline">Soy profesional</span>
        </a>
        <a
          routerLink="/perfil"
          class="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-brand font-display text-sm font-bold text-white"
          [attr.aria-label]="'Tu perfil, ' + user.name"
        >{{ user.headerInitial }}</a>
      </div>
    </header>
  `,
})
export class ClientHeader {
  private readonly route = inject(CurrentRoute);
  private readonly requests = inject(ClientRequestsStore);

  protected readonly city = CITY;
  protected readonly user = CLIENT_USER;
  protected readonly pending = this.requests.pendingActions;

  protected readonly nav: NavItem[] = [
    { label: 'Buscar', link: '/', activeOn: ['/', '/solicitud', '/profesionales', '/profesional', '/presupuesto'] },
    { label: 'Urgencias', link: '/urgencias', activeOn: ['/urgencias'] },
    { label: 'Mis solicitudes', link: '/mis-solicitudes', activeOn: ['/mis-solicitudes'] },
  ];

  protected isActive(item: NavItem): boolean {
    return this.route.matches(...item.activeOn);
  }
}
