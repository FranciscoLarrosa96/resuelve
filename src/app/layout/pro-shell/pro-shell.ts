import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CurrentRoute } from '../../core/services/current-route.service';
import { ProStore } from '../../core/state/pro.store';
import { MobileNav, MobileNavItem } from '../mobile-nav/mobile-nav';
import { ProSidebar } from '../pro-sidebar/pro-sidebar';

/**
 * Marco del área profesional.
 * Desktop: sidebar + contenido. Mobile/tablet: navegación inferior.
 */
@Component({
  selector: 'app-pro-shell',
  imports: [RouterOutlet, ProSidebar, MobileNav],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-dvh lg:grid lg:grid-cols-[236px_minmax(0,1fr)]">
      <app-pro-sidebar class="hidden border-r border-line-input bg-sidebar lg:block" />
      <main class="min-w-0 lg:px-9 lg:pt-7 lg:pb-16" [class]="showMobileNav() ? 'max-lg:pb-21' : ''">
        <router-outlet />
      </main>
    </div>
    @if (showMobileNav()) {
      <app-mobile-nav [items]="navItems()" label="Área profesional" />
    }
  `,
})
export class ProShell {
  private readonly route = inject(CurrentRoute);
  private readonly store = inject(ProStore);

  protected readonly navItems = computed<MobileNavItem[]>(() => [
    { label: 'Inicio', link: '/pro/dashboard', icon: 'home', activeOn: ['/pro/dashboard'] },
    {
      label: 'Solicitudes', link: '/pro/solicitudes', icon: 'list', activeOn: ['/pro/solicitudes'],
      badge: this.store.counts().new,
    },
    { label: 'Agenda', link: '/pro/agenda', icon: 'calendar', activeOn: ['/pro/agenda'] },
    { label: 'Perfil', link: '/pro/perfil', icon: 'user', activeOn: ['/pro/perfil'] },
  ]);

  protected readonly showMobileNav = computed(() => this.route.data()['mobileNav'] === true);
}
