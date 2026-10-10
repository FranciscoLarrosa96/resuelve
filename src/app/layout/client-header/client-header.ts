import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrentRoute } from '../../core/services/current-route.service';
import { AuthStore } from '../../core/state/auth.store';
import { NotificationsStore } from '../../core/state/notifications.store';
import { newsLabel } from '../../core/utils/badges';
import { ProRequestsStore } from '../../core/state/pro-requests.store';
import { proModeBadge } from '../../core/state/pro-mode-badge';
import { LocalityPicker } from '../../shared/components/locality-picker/locality-picker';
import { Logo } from '../../shared/components/logo/logo';
import { ModeSwitch } from '../../shared/components/mode-switch/mode-switch';
import { AccountMenu } from '../account-menu/account-menu';
import { NotificationBell } from '../../shared/components/notification-bell/notification-bell';

interface NavItem {
  label: string;
  link: string;
  activeOn: string[];
  badge?: number;
}

/** Header desktop del cliente (≥ lg). */
@Component({
  selector: 'app-client-header',
  imports: [RouterLink, Logo, AccountMenu, ModeSwitch, NotificationBell, LocalityPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="sticky top-0 z-20 bg-canvas/95 backdrop-blur-sm">
      <div class="mx-auto flex h-[76px] max-w-[1560px] items-center gap-2.5 px-5 xl:gap-5 xl:px-8">
        <a routerLink="/" class="shrink-0 rounded-lg" aria-label="Resuelve, inicio">
          <app-logo size="lg" />
        </a>
        <!-- Ciudad donde se busca: visible y cambiable desde cualquier pantalla del cliente. -->
        <app-locality-picker [compact]="true" [short]="true" class="min-w-0 shrink" />
        <nav class="ml-1 flex shrink-0 gap-1" aria-label="Principal">
          @for (item of nav(); track item.link) {
            <a
              [routerLink]="item.link"
              class="flex items-center gap-2 relative border-b-2 px-3 py-[14px] text-sm font-semibold whitespace-nowrap transition-colors hover:text-brand"
              [class]="
                isActive(item)
                  ? 'border-brand text-brand-dark'
                  : 'border-transparent text-muted hover:text-ink'
              "
              [attr.aria-current]="isActive(item) ? 'page' : null"
              [attr.aria-label]="item.badge ? newsLabel(item.badge, item.label) : null"
            >
              {{ item.label }}
              @if (item.badge) {
                <span
                  class="rounded-full bg-accent-fill px-1.75 py-0.5 text-[14px] leading-none font-bold text-white tabular-nums"
                  aria-hidden="true"
                  >{{ item.badge }}</span
                >
              }
            </a>
          }
        </nav>
        <div class="min-w-0 flex-1"></div>
        @if (isPro()) {
          <!-- Ya es profesional: cambio de modo, nunca "Soy profesional". -->
          <app-mode-switch mode="client" [badge]="pending()" class="shrink-0" />
        } @else if (!auth.initializing()) {
          <a
            routerLink="/soy-profesional"
            class="shrink-0 rounded-lg px-3.5 py-[9px] text-sm font-semibold whitespace-nowrap text-ink hover:bg-surface press"
          >
            <span class="xl:hidden">Soy pro</span
            ><span class="hidden xl:inline">Soy profesional</span>
          </a>
        }
        @if (auth.authenticated()) {
          <app-notification-bell audience="CLIENT" />
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

  /**
   * "Modo profesional" con lo REAL que espera en ese modo (invitaciones sin
   * responder, novedades y trabajos por cerrar), solo con ProfessionalProfile.
   * Nunca se suma a "Mis solicitudes": los contadores no se mezclan.
   */
  protected readonly pending = proModeBadge();
  protected readonly newsLabel = newsLabel;
  protected readonly isPro = this.reqs.hasProfile;

  protected readonly nav = computed<NavItem[]>(() => [
    {
      label: 'Buscar',
      link: '/',
      activeOn: ['/', '/solicitud', '/profesionales', '/profesional', '/presupuesto'],
    },
    { label: 'Urgencias', link: '/urgencias', activeOn: ['/urgencias'] },
    {
      label: 'Mis solicitudes',
      link: '/mis-solicitudes',
      activeOn: ['/mis-solicitudes'],
      badge: this.notifications.clientBadge(),
    },
  ]);

  protected isActive(item: NavItem): boolean {
    return this.route.matches(...item.activeOn);
  }
}
