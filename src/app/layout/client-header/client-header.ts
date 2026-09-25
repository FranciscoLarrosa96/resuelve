import { ChangeDetectionStrategy, Component, computed, effect, inject, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CITY } from '../../core/data/catalog.data';
import { CurrentRoute } from '../../core/services/current-route.service';
import { AuthStore } from '../../core/state/auth.store';
import { ProRequestsStore } from '../../core/state/pro-requests.store';
import { Icon } from '../../shared/components/icon/icon';
import { Logo } from '../../shared/components/logo/logo';
import { AccountMenu } from '../account-menu/account-menu';

interface NavItem {
  label: string;
  link: string;
  activeOn: string[];
}

/** Header desktop del cliente (≥ lg). */
@Component({
  selector: 'app-client-header',
  imports: [RouterLink, Logo, Icon, AccountMenu],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="sticky top-0 z-20 border-b border-track bg-canvas/95 backdrop-blur-md">
      <div class="mx-auto flex h-[68px] max-w-[1320px] items-center gap-2.5 px-5 xl:gap-5 xl:px-8">
        <a routerLink="/" class="shrink-0 rounded-lg" aria-label="Resuelve, inicio">
          <app-logo size="lg" />
        </a>
        <button
          type="button"
          class="hidden shrink-0 items-center gap-1.5 rounded-full border border-line-input bg-white px-3 py-[7px] text-[13.5px] font-medium whitespace-nowrap text-ink xl:flex"
        >
          <app-icon name="pin" [size]="14" class="text-brand" />{{ city }}
        </button>
        <nav class="ml-1 flex shrink-0 gap-1" aria-label="Principal">
          @for (item of nav; track item.link) {
            <a
              [routerLink]="item.link"
              class="rounded-lg px-3 py-[9px] text-sm font-semibold whitespace-nowrap transition-colors hover:bg-sand-dark"
              [class]="isActive(item) ? 'bg-sand-dark text-ink' : 'text-muted'"
              [attr.aria-current]="isActive(item) ? 'page' : null"
            >{{ item.label }}</a>
          }
        </nav>
        <div class="min-w-0 flex-1"></div>
        @if (isPro()) {
          <!-- Ya es profesional: cambio de modo, nunca "Soy profesional". -->
          <a
            routerLink="/pro/solicitudes"
            class="flex shrink-0 items-center gap-2 rounded-xl border border-line-btn px-3.5 py-[9px] text-sm font-semibold whitespace-nowrap text-ink transition-colors hover:bg-white"
            [attr.aria-label]="pending() ? 'Modo profesional, ' + pending() + (pending() === 1 ? ' solicitud nueva' : ' solicitudes nuevas') : null"
          >
            Modo profesional
            @if (pending()) {
              <span class="rounded-full bg-accent px-1.75 py-0.5 text-[11px] leading-none font-bold text-white tabular-nums" aria-hidden="true">{{ pending() }}</span>
            }
          </a>
        } @else if (!auth.initializing()) {
          <a
            routerLink="/pro"
            class="shrink-0 rounded-xl border border-line-btn px-3.5 py-[9px] text-sm font-semibold whitespace-nowrap text-ink transition-colors hover:bg-white"
          >
            <span class="xl:hidden">Soy pro</span><span class="hidden xl:inline">Soy profesional</span>
          </a>
        }
        <app-account-menu />
      </div>
    </header>
  `,
})
export class ClientHeader {
  private readonly route = inject(CurrentRoute);
  private readonly reqs = inject(ProRequestsStore);
  protected readonly auth = inject(AuthStore);

  protected readonly city = CITY;
  /**
   * "Modo profesional" con la cantidad REAL de invitaciones
   * sin responder, solo para quien tiene ProfessionalProfile.
   */
  protected readonly pending = computed(() => (this.reqs.hasProfile() ? this.reqs.pendingCount() ?? 0 : 0));
  protected readonly isPro = this.reqs.hasProfile;

  constructor() {
    effect(() => {
      if (this.reqs.hasProfile()) untracked(() => this.reqs.loadPendingCount());
    });
  }

  protected readonly nav: NavItem[] = [
    { label: 'Buscar', link: '/', activeOn: ['/', '/solicitud', '/profesionales', '/profesional', '/presupuesto'] },
    { label: 'Urgencias', link: '/urgencias', activeOn: ['/urgencias'] },
    { label: 'Mis solicitudes', link: '/mis-solicitudes', activeOn: ['/mis-solicitudes'] },
  ];

  protected isActive(item: NavItem): boolean {
    return this.route.matches(...item.activeOn);
  }
}
