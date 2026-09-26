import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrentRoute } from '../../core/services/current-route.service';
import { NotificationsStore } from '../../core/state/notifications.store';
import { ProRequestsStore } from '../../core/state/pro-requests.store';
import { completionDueLabel, newsLabel } from '../../core/utils/badges';
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
  badgeLabel?: string;
}

/**
 * Sidebar desktop del profesional (≥ lg). Identidad = usuario autenticado.
 * "Tu mes" es real (actividad del mes). Plan no está en el menú: se llega
 * desde los avisos contextuales (Tu mes, perfil), sin banners.
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
      <a routerLink="/pro/dashboard" class="self-start rounded-lg px-1.5" aria-label="Resuelve, panel profesional">
        <app-logo />
      </a>

      <app-availability-switch variant="compact" />

      <nav class="flex flex-col gap-0.5" aria-label="Área profesional">
        @for (item of items(); track item.link) {
          <a
            [routerLink]="item.link"
            class="flex items-center gap-2.75 rounded-lg px-2.5 py-2.25 text-sm font-semibold transition-colors hover:bg-white"
            [class]="isActive(item) ? 'bg-white text-ink' : 'text-ink-soft'"
            [attr.aria-current]="isActive(item) ? 'page' : null"
            [attr.aria-label]="item.badge ? item.badgeLabel : null"
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
                class="rounded-full px-1.75 py-0.5 text-[11px] font-bold tabular-nums"
                [class]="item.badgeTone === 'accent' ? 'bg-accent-strong text-white' : 'bg-brand-soft text-brand'"
                aria-hidden="true"
              >{{ item.badge }}</span>
            }
          </a>
        }
      </nav>

      <div class="flex-1"></div>

      @if (store.me(); as me) {
        <div class="flex items-center gap-2.5 px-1 pt-1">
          <app-avatar [subject]="me" class="size-9 rounded-full text-xs" alt="" />
          <div class="min-w-0 flex-1">
            <div class="truncate text-[13.5px] font-semibold" [attr.title]="me.name">{{ me.name }}</div>
            <a routerLink="/" class="text-xs font-medium text-brand hover:underline">Ver como cliente</a>
          </div>
        </div>
      }
    </aside>
  `,
})
export class ProSidebar {
  protected readonly store = inject(ProStore);
  private readonly reqs = inject(ProRequestsStore);
  private readonly route = inject(CurrentRoute);
  private readonly notifications = inject(NotificationsStore);
  /** Invitaciones sin responder + novedades del modo profesional (elegido, horario confirmado/rechazado). */
  private readonly requestsBadge = computed(() => (this.reqs.pendingCount() ?? 0) + this.notifications.proUnread());

  protected readonly items = computed<SideItem[]>(() => [
    { label: 'Inicio', link: '/pro/dashboard', icon: 'home', activeOn: ['/pro/dashboard'] },
    {
      label: 'Solicitudes', link: '/pro/solicitudes', icon: 'inbox', activeOn: ['/pro/solicitudes'],
      badge: this.requestsBadge() || undefined, badgeTone: 'accent',
      badgeLabel: newsLabel(this.requestsBadge(), 'Solicitudes'),
    },
    {
      label: 'Agenda', link: '/pro/agenda', icon: 'agenda', activeOn: ['/pro/agenda'],
      badge: this.notifications.proCompletionDue() || undefined, badgeTone: 'brand',
      badgeLabel: completionDueLabel(this.notifications.proCompletionDue()),
    },
    { label: 'Tu mes', link: '/pro/estadisticas', icon: 'chart', activeOn: ['/pro/estadisticas'] },
    { label: 'Perfil', link: '/pro/perfil', icon: 'person', activeOn: ['/pro/perfil'] },
  ]);

  protected isActive(item: SideItem): boolean {
    return this.route.matches(...item.activeOn);
  }
}
