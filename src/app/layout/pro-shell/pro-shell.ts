import { ChangeDetectionStrategy, Component, computed, effect, inject, untracked } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CurrentRoute } from '../../core/services/current-route.service';
import { AuthStore } from '../../core/state/auth.store';
import { NotificationsStore } from '../../core/state/notifications.store';
import { ProRequestsStore } from '../../core/state/pro-requests.store';
import { completionDueLabel, newsLabel } from '../../core/utils/badges';
import { MobileNav, MobileNavItem } from '../mobile-nav/mobile-nav';
import { ProSidebar } from '../pro-sidebar/pro-sidebar';
import { Logo } from '../../shared/components/logo/logo';

/**
 * Marco del área profesional.
 * Desktop: sidebar + contenido. Mobile/tablet: navegación inferior.
 * Sin sesión confirmada (restaurando, SSR/prerender o camino a /ingresar)
 * solo muestra "Cargando tu cuenta…": el panel no se monta sin usuario.
 */
@Component({
  selector: 'app-pro-shell',
  imports: [RouterOutlet, ProSidebar, MobileNav, Logo],
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
