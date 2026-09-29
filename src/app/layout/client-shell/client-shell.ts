import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { CurrentRoute } from '../../core/services/current-route.service';
import { AuthStore } from '../../core/state/auth.store';
import { NotificationsStore } from '../../core/state/notifications.store';
import { newsLabel } from '../../core/utils/badges';
import { SearchStore } from '../../core/state/search.store';
import { ClientHeader } from '../client-header/client-header';
import { MobileNav, MobileNavItem } from '../mobile-nav/mobile-nav';

/**
 * Marco del área cliente.
 * Desktop (≥ lg): header fijo arriba. Mobile/tablet: navegación inferior
 * en las pantallas "raíz" (definido por `data.mobileNav` en las rutas).
 * Pie discreto con los enlaces legales (Términos de Uso y Política de Privacidad).
 */
@Component({
  selector: 'app-client-shell',
  imports: [RouterOutlet, RouterLink, ClientHeader, MobileNav],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <app-client-header class="hidden lg:block" />
    <main>
      <router-outlet />
    </main>
    <footer class="border-t border-line-soft" [class]="showMobileNav() ? 'max-lg:pb-21' : ''">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-4 text-[13.5px] text-muted sm:px-5">
        <p>Resuelve · Tandil</p>
        <nav aria-label="Legal" class="flex flex-wrap gap-x-5">
          <a routerLink="/terminos" class="inline-block py-1.5 font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline">Términos de Uso</a>
          <a routerLink="/privacidad" class="inline-block py-1.5 font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline">Política de Privacidad</a>
        </nav>
      </div>
    </footer>
    @if (showMobileNav()) {
      <app-mobile-nav [items]="navItems()" label="Navegación principal" />
    }
  `,
})
export class ClientShell {
  private readonly route = inject(CurrentRoute);
  private readonly search = inject(SearchStore);
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

  /** En resultados la barra se oculta cuando aparece la barra de selección. */
  protected readonly showMobileNav = computed(() => {
    const mode = this.route.data()['mobileNav'];
    if (mode === 'unless-selection') return this.search.selectedIds().length === 0;
    return mode === true;
  });
}
