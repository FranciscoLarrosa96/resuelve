import { ChangeDetectionStrategy, Component, computed, effect, inject, untracked } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { CurrentRoute } from '../../core/services/current-route.service';
import { AuthStore } from '../../core/state/auth.store';
import { NotificationsStore } from '../../core/state/notifications.store';
import { ProRequestsStore } from '../../core/state/pro-requests.store';
import { completionDueLabel, newsLabel } from '../../core/utils/badges';
import { MobileNav, MobileNavItem } from '../mobile-nav/mobile-nav';
import { ProSidebar } from '../pro-sidebar/pro-sidebar';
import { Logo } from '../../shared/components/logo/logo';
import { ModeSwitch } from '../../shared/components/mode-switch/mode-switch';
import { AccountMenu } from '../account-menu/account-menu';

/**
 * Marco del área profesional.
 * Desktop: sidebar + contenido. Mobile/tablet: navegación inferior.
 * Sin sesión confirmada (restaurando, SSR/prerender o camino a /ingresar)
 * solo muestra "Cargando tu cuenta…": el panel no se monta sin usuario.
 */
@Component({
  selector: 'app-pro-shell',
  imports: [RouterOutlet, RouterLink, ProSidebar, MobileNav, Logo, ModeSwitch, AccountMenu],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!auth.authenticated()) {
      <!-- Restaurando la sesión (y el HTML prerenderizado): nunca contenido del panel ni datos de ejemplo. -->
      <main class="flex min-h-dvh flex-col items-center justify-center px-4 pb-16">
        <h1 class="sr-only">Panel profesional</h1>
        <app-logo />
        <div class="mt-8 flex flex-col items-center gap-3" role="status">
          <span class="size-7 animate-spin rounded-full border-[3px] border-brand/25 border-t-brand" aria-hidden="true"></span>
          <p class="text-sm text-muted">Cargando tu cuenta…</p>
        </div>
      </main>
    } @else {
    <div class="min-h-dvh lg:grid lg:grid-cols-[236px_minmax(0,1fr)]">
      <app-pro-sidebar class="hidden border-r border-line-input bg-sidebar lg:block" />
      <main class="min-w-0 lg:px-9 lg:pt-7 lg:pb-16" [class]="showMobileNav() ? 'max-lg:pb-21' : ''">
        @if (showMobileNav()) {
          <!-- Mobile/tablet: marca + modo actual + menú de cuenta (en desktop están en el sidebar). En teléfonos angostos el cambio de modo vive en el menú ("Ver como cliente"). -->
          <header class="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-2.5 lg:hidden md:px-6">
            <a routerLink="/pro/dashboard" class="rounded-lg" aria-label="Resuelve, panel profesional"><app-logo /></a>
            <div class="flex items-center gap-2">
              <app-mode-switch mode="pro" class="max-[479px]:hidden" />
              <app-account-menu mode="pro" variant="compact" />
            </div>
          </header>
        }
        <router-outlet />
      </main>
    </div>
    @if (showMobileNav()) {
      <app-mobile-nav [items]="navItems()" label="Área profesional" />
    }
    }
  `,
})
export class ProShell {
  protected readonly auth = inject(AuthStore);
  private readonly route = inject(CurrentRoute);
  private readonly reqs = inject(ProRequestsStore);
  private readonly notifications = inject(NotificationsStore);
  private readonly requestsBadge = computed(() => (this.reqs.pendingCount() ?? 0) + this.notifications.proUnread());

  protected readonly navItems = computed<MobileNavItem[]>(() => [
    { label: 'Inicio', link: '/pro/dashboard', icon: 'home', activeOn: ['/pro/dashboard'] },
    {
      label: 'Solicitudes', link: '/pro/solicitudes', icon: 'list', activeOn: ['/pro/solicitudes'],
      badge: this.requestsBadge(),
      badgeLabel: newsLabel(this.requestsBadge(), 'Solicitudes'),
    },
    {
      label: 'Agenda', link: '/pro/agenda', icon: 'calendar', activeOn: ['/pro/agenda'],
      badge: this.notifications.proCompletionDue(),
      badgeLabel: completionDueLabel(this.notifications.proCompletionDue()),
    },
    { label: 'Perfil', link: '/pro/perfil', icon: 'user', activeOn: ['/pro/perfil'] },
  ]);

  protected readonly showMobileNav = computed(() => this.route.data()['mobileNav'] === true);

  constructor() {
    effect(() => {
      if (this.reqs.hasProfile()) untracked(() => this.reqs.loadPendingCount());
    });
  }
}
