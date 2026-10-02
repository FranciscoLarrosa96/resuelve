import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CurrentRoute } from '../../core/services/current-route.service';
import { AuthStore } from '../../core/state/auth.store';
import { NotificationsStore } from '../../core/state/notifications.store';
import { newsLabel } from '../../core/utils/badges';
import { ClientHeader } from '../client-header/client-header';
import { MobileNav, MobileNavItem } from '../mobile-nav/mobile-nav';
import { SiteFooter } from '../../shared/components/site-footer/site-footer';

/**
 * Marco del área cliente.
 * Desktop (≥ lg): header fijo arriba. Mobile/tablet: navegación inferior
 * en las pantallas "raíz" (definido por `data.mobileNav` en las rutas).
 * Pie discreto con los enlaces legales (Términos de Uso y Política de Privacidad).
 */
@Component({
  selector: 'app-client-shell',
  imports: [RouterOutlet, ClientHeader, MobileNav, SiteFooter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-dvh min-w-0 flex-col' },
  template: `
    <app-client-header class="hidden lg:block" />
    <main class="flex-1">
      <router-outlet />
    </main>
    <app-site-footer [mobileNav]="showMobileNav()" />
    @if (showMobileNav()) {
      <app-mobile-nav [items]="navItems()" label="Navegación principal" />
    }
  `,
})
export class ClientShell {
  private readonly route = inject(CurrentRoute);
  private readonly auth = inject(AuthStore);
  private readonly notifications = inject(NotificationsStore);

  /** Invitado: el último ítem es "Ingresar". Mientras restaura la sesión, "Perfil". */
  protected readonly navItems = computed<MobileNavItem[]>(() => [
    { label: 'Inicio', link: '/', icon: 'home', activeOn: ['/'] },
    { label: 'Buscar', link: '/profesionales', icon: 'search', activeOn: ['/profesionales'] },
    {
      label: 'Solicitudes', link: '/mis-solicitudes', icon: 'list', activeOn: ['/mis-solicitudes'],
      badge: this.notifications.clientBadge(),
      badgeLabel: newsLabel(this.notifications.clientBadge(), 'Solicitudes'),
    },
    this.auth.initializing() || this.auth.authenticated()
      ? { label: 'Perfil', link: '/perfil', icon: 'user', activeOn: ['/perfil'] }
      : { label: 'Ingresar', link: '/ingresar', icon: 'user', activeOn: ['/ingresar', '/registro'] },
  ]);

  /** Navegación inferior de las pantallas raíz. */
  protected readonly showMobileNav = computed(() => {
    const mode = this.route.data()['mobileNav'];
    return mode === true;
  });
}
