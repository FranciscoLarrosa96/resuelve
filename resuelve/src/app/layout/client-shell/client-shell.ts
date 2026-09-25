import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CurrentRoute } from '../../core/services/current-route.service';
import { SearchStore } from '../../core/state/search.store';
import { ClientHeader } from '../client-header/client-header';
import { MobileNav, MobileNavItem } from '../mobile-nav/mobile-nav';

/**
 * Marco del área cliente.
 * Desktop (≥ lg): header fijo arriba. Mobile/tablet: navegación inferior
 * en las pantallas "raíz" (definido por `data.mobileNav` en las rutas).
 */
@Component({
  selector: 'app-client-shell',
  imports: [RouterOutlet, ClientHeader, MobileNav],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-client-header class="hidden lg:block" />
    <main [class]="showMobileNav() ? 'max-lg:pb-21' : ''">
      <router-outlet />
    </main>
    @if (showMobileNav()) {
      <app-mobile-nav [items]="navItems" label="Navegación principal" />
    }
  `,
})
export class ClientShell {
  private readonly route = inject(CurrentRoute);
  private readonly search = inject(SearchStore);

  protected readonly navItems: MobileNavItem[] = [
    { label: 'Inicio', link: '/', icon: 'home', activeOn: ['/'] },
    { label: 'Buscar', link: '/profesionales', icon: 'search', activeOn: ['/profesionales'] },
    { label: 'Solicitudes', link: '/mis-solicitudes', icon: 'list', activeOn: ['/mis-solicitudes'] },
    { label: 'Perfil', link: '/perfil', icon: 'user', activeOn: ['/perfil'] },
  ];

  /** En resultados la barra se oculta cuando aparece la barra de selección. */
  protected readonly showMobileNav = computed(() => {
    const mode = this.route.data()['mobileNav'];
    if (mode === 'unless-selection') return this.search.selectedIds().length === 0;
    return mode === true;
  });
}
