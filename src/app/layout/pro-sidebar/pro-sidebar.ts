import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PRO_STATS } from '../../core/data/pro.data';
import { CurrentRoute } from '../../core/services/current-route.service';
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

/** Sidebar desktop del profesional (≥ lg). */
@Component({
  selector: 'app-pro-sidebar',
  imports: [RouterLink, Logo, Icon, Avatar, AvailabilitySwitch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside
      class="sticky top-0 flex h-dvh flex-col gap-4 overflow-y-auto px-3.5 py-4.5"
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

      @if (store.isFree()) {
        <div class="rounded-xl border border-line-input bg-white p-3">
          <div class="flex justify-between text-[13px] font-semibold">
            <span>Plan Free</span><span class="font-medium text-muted">{{ stats.planUsed }} de {{ stats.planLimit }}</span>
          </div>
          <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-line-soft">
            <div class="h-full rounded-full bg-accent" [style.width.%]="store.planUsagePct"></div>
          </div>
          <div class="mt-1.5 text-xs text-muted">solicitudes usadas este mes</div>
          <a
            routerLink="/pro/plan"
            class="mt-2.5 flex h-9 w-full items-center justify-center rounded-lg bg-ink text-[13px] font-semibold text-white"
          >Pasar a PRO</a>
        </div>
      } @else {
        <div class="rounded-xl bg-brand p-3 text-[13px] font-semibold text-white">
          Plan PRO activo
          <div class="mt-0.5 text-xs font-normal text-on-brand-muted">Prueba gratis · quedan 30 días</div>
        </div>
      }

      <div class="flex items-center gap-2.5 px-1 pt-1">
        <app-avatar [subject]="store.me" class="size-9 rounded-full text-xs" alt="" />
        <div class="min-w-0 flex-1">
          <div class="truncate text-[13.5px] font-semibold">{{ store.settings().name }}</div>
          <a routerLink="/" class="text-xs font-medium text-brand hover:underline">Ver como cliente</a>
        </div>
      </div>
    </aside>
  `,
})
export class ProSidebar {
  protected readonly store = inject(ProStore);
  private readonly route = inject(CurrentRoute);
  protected readonly stats = PRO_STATS;

  protected readonly items = computed<SideItem[]>(() => [
    { label: 'Inicio', link: '/pro/dashboard', icon: 'home', activeOn: ['/pro/dashboard'] },
    {
      label: 'Solicitudes', link: '/pro/solicitudes', icon: 'inbox', activeOn: ['/pro/solicitudes'],
      badge: this.store.counts().new || undefined, badgeTone: 'accent',
    },
    { label: 'Agenda', link: '/pro/agenda', icon: 'agenda', activeOn: ['/pro/agenda'] },
    {
      label: 'Tu mes', link: '/pro/estadisticas', icon: 'chart', activeOn: ['/pro/estadisticas'],
      badge: this.store.isFree() ? 'PRO' : undefined, badgeTone: 'brand',
    },
    { label: 'Perfil', link: '/pro/perfil', icon: 'person', activeOn: ['/pro/perfil'] },
    { label: 'Plan', link: '/pro/plan', icon: 'star', activeOn: ['/pro/plan'] },
  ]);

  protected isActive(item: SideItem): boolean {
    return this.route.matches(...item.activeOn);
  }
}
