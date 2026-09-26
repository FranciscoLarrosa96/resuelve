import { ChangeDetectionStrategy, Component, computed, effect, inject, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CITY } from '../../core/data/catalog.data';
import { CurrentRoute } from '../../core/services/current-route.service';
import { AuthStore } from '../../core/state/auth.store';
import { NotificationsStore } from '../../core/state/notifications.store';
import { newsLabel } from '../../core/utils/badges';
import { ProRequestsStore } from '../../core/state/pro-requests.store';
import { Icon } from '../../shared/components/icon/icon';
import { Logo } from '../../shared/components/logo/logo';
import { AccountMenu } from '../account-menu/account-menu';

interface NavItem {
  label: string;
  link: string;
  activeOn: string[];
  badge?: number;
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
          class="hidden shrink-0 items-center gap-1.5 rounded-full border border-line-input bg-white px-3 py-[7px] text-[13.5px] font-medium whitespace-nowrap text-ink xl:flex press"
        >
          <app-icon name="pin" [size]="14" class="text-brand" />{{ city }}
        </button>
        <nav class="ml-1 flex shrink-0 gap-1" aria-label="Principal">
          @for (item of nav(); track item.link) {
            <a
              [routerLink]="item.link"
              class="flex items-center gap-2 rounded-lg px-3 py-[9px] text-sm font-semibold whitespace-nowrap transition-colors hover:bg-sand-dark"
              [class]="isActive(item) ? 'bg-sand-dark text-ink' : 'text-muted'"
              [attr.aria-current]="isActive(item) ? 'page' : null"
              [attr.aria-label]="item.badge ? newsLabel(item.badge, item.label) : null"
            >
              {{ item.label }}
              @if (item.badge) {
                <span class="rounded-full bg-accent-strong px-1.75 py-0.5 text-[11px] leading-none font-bold text-white tabular-nums" aria-hidden="true">{{ item.badge }}</span>
              }
            </a>
          }
        </nav>
        <div class="min-w-0 flex-1"></div>
        @if (isPro()) {
          <!-- Ya es profesional: cambio de modo, nunca "Soy profesional". -->
          <a
            routerLink="/pro/solicitudes"
            class="flex shrink-0 items-center gap-2 rounded-xl border border-line-btn px-3.5 py-[9px] text-sm font-semibold whitespace-nowrap text-ink hover:bg-white press"
            [attr.aria-label]="pending() ? newsLabel(pending(), 'Modo profesional') : null"
          >
            Modo profesional
            @if (pending()) {
              <span class="rounded-full bg-accent-strong px-1.75 py-0.5 text-[11px] leading-none font-bold text-white tabular-nums" aria-hidden="true">{{ pending() }}</span>
            }
          </a>
        } @else if (!auth.initializing()) {
          <a
            routerLink="/soy-profesional"
            class="shrink-0 rounded-xl border border-line-btn px-3.5 py-[9px] text-sm font-semibold whitespace-nowrap text-ink hover:bg-white press"
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
  private readonly notifications = inject(NotificationsStore);

  protected readonly city = CITY;
  /**
   * "Modo profesional" con lo REAL que espera en ese modo (invitaciones sin
   * responder, novedades y trabajos por cerrar), solo con ProfessionalProfile.
   * Nunca se suma a "Mis solicitudes": los contadores no se mezclan.
   */
  protected readonly pending = computed(() =>
    this.reqs.hasProfile()
      ? (this.reqs.pendingCount() ?? 0) + this.notifications.proUnread() + this.notifications.proCompletionDue()
      : 0,
  );
  protected readonly newsLabel = newsLabel;
  protected readonly isPro = this.reqs.hasProfile;

  constructor() {
    effect(() => {
      if (this.reqs.hasProfile()) untracked(() => this.reqs.loadPendingCount());
    });
  }

  protected readonly nav = computed<NavItem[]>(() => [
    { label: 'Buscar', link: '/', activeOn: ['/', '/solicitud', '/profesionales', '/profesional', '/presupuesto'] },
    { label: 'Urgencias', link: '/urgencias', activeOn: ['/urgencias'] },
    {
      label: 'Mis solicitudes', link: '/mis-solicitudes', activeOn: ['/mis-solicitudes'],
      badge: this.notifications.clientBadge(),
    },
  ]);

  protected isActive(item: NavItem): boolean {
    return this.route.matches(...item.activeOn);
  }
}
