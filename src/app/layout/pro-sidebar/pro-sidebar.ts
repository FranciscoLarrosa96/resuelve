import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrentRoute } from '../../core/services/current-route.service';
import { ProRequestsStore } from '../../core/state/pro-requests.store';
import { ProStore } from '../../core/state/pro.store';
import { Avatar } from '../../shared/components/avatar/avatar';
import { Icon, IconName } from '../../shared/components/icon/icon';
import { Logo } from '../../shared/components/logo/logo';
import { AvailabilitySwitch } from '../../shared/components/availability-switch/availability-switch';

interface SideItem {
  label: string;
  link: string;
  icon: IconName;
  activeOn: string[];
  badge?: string | number;
  badgeTone?: 'accent' | 'brand';
}

/**
 * Sidebar desktop del profesional (≥ lg). Identidad = usuario autenticado.
 * Sin bloque de plan/uso: los planes comerciales todavía no están definidos
 * (la pantalla Plan muestra solo las capacidades disponibles).
 */
@Component({
  selector: 'app-pro-sidebar',
  imports: [RouterLink, Logo, Icon, Avatar, AvailabilitySwitch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside
      class="sticky top-0 flex h-dvh flex-col gap-4 overflow-y-auto px-3.5 py-4.5"
      aria-label="Menú profesional"
    >
      <a routerLink="/pro/dashboard" class="self-start rounded-lg px-1.5" aria-label="Resuelve Pro, inicio">
        <app-logo [pro]="true" />
      </a>

      <app-availability-switch variant="compact" />

      <nav class="flex flex-col gap-0.5" aria-label="Área profesional">
        @for (item of items(); track item.link) {
          <a
            [routerLink]="item.link"
            class="flex items-center gap-2.75 rounded-lg px-2.5 py-2.25 text-sm font-semibold transition-colors hover:bg-white"
            [class]="isActive(item) ? 'bg-white text-ink' : 'text-ink-soft'"
            [attr.aria-current]="isActive(item) ? 'page' : null"
          >
            <app-icon
              [name]="item.icon"
              [size]="18"
              [stroke]="2"
              [class]="isActive(item) ? 'text-brand' : 'text-subtle'"
            />
            <span class="flex-1">{{ item.label }}</span>
            @if (item.badge) {
              <span
                class="rounded-full px-1.75 py-0.5 text-[11px] font-bold"
                [class]="item.badgeTone === 'accent' ? 'bg-accent text-white' : 'bg-brand-soft text-brand'"
              >{{ item.badge }}</span>
            }
          </a>
        }
      </nav>

      <div class="flex-1"></div>

      <div class="flex items-center gap-2.5 px-1 pt-1">
        <app-avatar [subject]="store.me()" class="size-9 rounded-full text-xs" alt="" />
        <div class="min-w-0 flex-1">
          <div class="truncate text-[13.5px] font-semibold" [attr.title]="store.me().name">{{ store.me().name }}</div>
          <a routerLink="/" class="text-xs font-medium text-brand hover:underline">Ver como cliente</a>
        </div>
      </div>
    </aside>
  `,
})
export class ProSidebar {
  protected readonly store = inject(ProStore);
  private readonly reqs = inject(ProRequestsStore);
  private readonly route = inject(CurrentRoute);

  protected readonly items = computed<SideItem[]>(() => [
    { label: 'Inicio', link: '/pro/dashboard', icon: 'home', activeOn: ['/pro/dashboard'] },
    {
      label: 'Solicitudes', link: '/pro/solicitudes', icon: 'inbox', activeOn: ['/pro/solicitudes'],
      badge: this.reqs.pendingCount() || undefined, badgeTone: 'accent',
    },
    { label: 'Agenda', link: '/pro/agenda', icon: 'agenda', activeOn: ['/pro/agenda'] },
    { label: 'Tu mes', link: '/pro/estadisticas', icon: 'chart', activeOn: ['/pro/estadisticas'] },
    { label: 'Perfil', link: '/pro/perfil', icon: 'person', activeOn: ['/pro/perfil'] },
    { label: 'Plan', link: '/pro/plan', icon: 'star', activeOn: ['/pro/plan'] },
  ]);

  protected isActive(item: SideItem): boolean {
    return this.route.matches(...item.activeOn);
  }
}
