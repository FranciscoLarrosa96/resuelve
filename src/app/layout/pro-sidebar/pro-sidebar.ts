import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrentRoute } from '../../core/services/current-route.service';
import { NotificationsStore } from '../../core/state/notifications.store';
import { ProRequestsStore } from '../../core/state/pro-requests.store';
import { newsLabel } from '../../core/utils/badges';
import { JobsStore } from '../../core/state/jobs.store';
import { ProStore } from '../../core/state/pro.store';
import { Icon, IconName } from '../../shared/components/icon/icon';
import { Logo } from '../../shared/components/logo/logo';
import { AvailabilitySwitch } from '../../shared/components/availability-switch/availability-switch';
import { ModeSwitch } from '../../shared/components/mode-switch/mode-switch';
import { AccountMenu } from '../account-menu/account-menu';
import { ProBadge } from '../../shared/components/plan-badges/plan-badges';

interface SideItem {
  label: string;
  link: string;
  icon: IconName;
  activeOn: string[];
  badge?: string | number;
  badgeTone?: 'accent' | 'brand';
  badgeLabel?: string;
  /** Rótulo discreto (no es un contador): "PRO" en Mi plan. */
  tag?: 'PRO';
}

/**
 * Sidebar desktop del profesional (≥ lg). Identidad = usuario autenticado.
 * "Tu mes" es real (actividad del mes). "Mi plan" siempre está: es la
 * gestión de la suscripción (estado, próximo cobro, cancelar), no un
 * anuncio; con PRO vigente lleva un rótulo discreto.
 */
@Component({
  selector: 'app-pro-sidebar',
  imports: [RouterLink, Logo, Icon, AccountMenu, AvailabilitySwitch, ModeSwitch, ProBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside
      class="sticky top-0 flex h-dvh flex-col gap-4 overflow-y-auto px-5 py-6"
      aria-label="Menú profesional"
    >
      <a
        routerLink="/pro/dashboard"
        class="self-start rounded-lg px-1.5"
        aria-label="Resuelve, panel profesional"
      >
        <app-logo />
      </a>

      <!-- Modo actual y cambio de modo, juntos y arriba -->
      <app-mode-switch mode="pro" [block]="true" />

      <app-availability-switch variant="compact" />

      <nav class="flex flex-col gap-1" aria-label="Área profesional">
        @for (item of items(); track item.link; let i = $index) {
          @if (i === 3) {
            <span
              class="mt-4 mb-1 px-3 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase"
              >Presencia y resultados</span
            >
          }
          <a
            [routerLink]="item.link"
            class="flex min-h-11 items-center gap-2.75 rounded-lg border-l-2 px-3 py-2 text-sm transition-colors duration-160 hover:bg-brand-tint"
            [class]="
              isActive(item)
                ? 'border-brand bg-surface font-semibold text-brand-dark'
                : 'border-transparent font-medium text-ink-soft'
            "
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
                [class]="
                  item.badgeTone === 'accent'
                    ? 'bg-accent-fill text-white'
                    : 'bg-brand-soft text-brand'
                "
                aria-hidden="true"
                >{{ item.badge }}</span
              >
            } @else if (item.tag) {
              <app-pro-badge data-testid="plan-nav-pro" />
            }
          </a>
        }
      </nav>

      <div class="flex-1"></div>

      <!-- Identidad = menú de cuenta (Mi perfil, Ver como cliente, Cerrar sesión) -->
      <div class="pt-4">
        <app-account-menu mode="pro" variant="sidebar" class="w-full" />
      </div>
    </aside>
  `,
})
export class ProSidebar {
  protected readonly store = inject(ProStore);
  private readonly reqs = inject(ProRequestsStore);
  private readonly route = inject(CurrentRoute);
  private readonly notifications = inject(NotificationsStore);
  private readonly jobs = inject(JobsStore);
  /** Solo las novedades cuya acción está en Solicitudes (nueva, te eligieron, necesitan otro horario). */
  private readonly requestsBadge = this.notifications.proRequestsNews;

  protected readonly items = computed<SideItem[]>(() => [
    { label: 'Inicio', link: '/pro/dashboard', icon: 'home', activeOn: ['/pro/dashboard'] },
    {
      label: 'Solicitudes',
      link: '/pro/solicitudes',
      icon: 'inbox',
      activeOn: ['/pro/solicitudes'],
      badge: this.requestsBadge() || undefined,
      badgeTone: 'accent',
      badgeLabel: newsLabel(this.requestsBadge(), 'Solicitudes'),
    },
    {
      label: 'Agenda',
      link: '/pro/agenda',
      icon: 'agenda',
      activeOn: ['/pro/agenda'],
      badge: this.jobs.toCoordinateCount() || undefined,
      badgeTone: 'brand',
      badgeLabel:
        this.jobs.toCoordinateCount() === 1
          ? 'Agenda, 1 trabajo para coordinar'
          : 'Agenda, ' + this.jobs.toCoordinateCount() + ' trabajos para coordinar',
    },
    { label: 'Tu mes', link: '/pro/estadisticas', icon: 'chart', activeOn: ['/pro/estadisticas'] },
    { label: 'Perfil', link: '/pro/perfil', icon: 'person', activeOn: ['/pro/perfil'] },
    {
      label: 'Mi plan',
      link: '/pro/plan',
      icon: 'card',
      activeOn: ['/pro/plan'],
      tag: this.store.hasPro() ? 'PRO' : undefined,
    },
  ]);

  protected isActive(item: SideItem): boolean {
    return this.route.matches(...item.activeOn);
  }
}
