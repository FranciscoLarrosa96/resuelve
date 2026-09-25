import { ChangeDetectionStrategy, Component, computed, effect, inject, untracked } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CurrentRoute } from '../../core/services/current-route.service';
import { ProRequestsStore } from '../../core/state/pro-requests.store';
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
        @if (isDemo()) {
          <p class="flex items-center gap-2 bg-accent-soft px-4 py-2 text-[13px] font-medium text-accent-ink lg:mb-5 lg:rounded-xl" role="note">
            <span class="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true"></span>
            Pantalla de demostración: salvo las solicitudes, los datos son de ejemplo y todavía no son tuyos.
          </p>
        }
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
  private readonly reqs = inject(ProRequestsStore);

  protected readonly navItems = computed<MobileNavItem[]>(() => [
    { label: 'Inicio', link: '/pro/dashboard', icon: 'home', activeOn: ['/pro/dashboard'] },
    {
      label: 'Solicitudes', link: '/pro/solicitudes', icon: 'list', activeOn: ['/pro/solicitudes'],
      badge: this.reqs.pendingCount() ?? 0,
    },
    { label: 'Agenda', link: '/pro/agenda', icon: 'calendar', activeOn: ['/pro/agenda'] },
    { label: 'Perfil', link: '/pro/perfil', icon: 'user', activeOn: ['/pro/perfil'] },
  ]);

  protected readonly showMobileNav = computed(() => this.route.data()['mobileNav'] === true);
  protected readonly isDemo = computed(() => this.route.data()['proDemo'] === true);

  constructor() {
    effect(() => {
      if (this.reqs.hasProfile()) untracked(() => this.reqs.loadPendingCount());
    });
  }
}
