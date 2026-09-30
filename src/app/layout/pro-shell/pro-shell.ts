import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { CurrentRoute } from '../../core/services/current-route.service';
import { AuthStore } from '../../core/state/auth.store';
import { NotificationsStore } from '../../core/state/notifications.store';
import { ProRequestsStore } from '../../core/state/pro-requests.store';
import { agendaLabel, newsLabel } from '../../core/utils/badges';
import { MobileNav, MobileNavItem } from '../mobile-nav/mobile-nav';
import { ProSidebar } from '../pro-sidebar/pro-sidebar';
import { Logo } from '../../shared/components/logo/logo';
import { ModeSwitch } from '../../shared/components/mode-switch/mode-switch';
import { AccountMenu } from '../account-menu/account-menu';
import { ProStore } from '../../core/state/pro.store';
import { Dialog } from '../../shared/components/dialog/dialog';

/**
 * Marco del área profesional.
 * Desktop: sidebar + contenido. Mobile/tablet: navegación inferior.
 * Sin sesión confirmada (restaurando, SSR/prerender o camino a /ingresar)
 * solo muestra "Cargando tu cuenta…": el panel no se monta sin usuario.
 */
@Component({
  selector: 'app-pro-shell',
  imports: [RouterOutlet, RouterLink, ProSidebar, MobileNav, Logo, ModeSwitch, AccountMenu, Dialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
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
    <div class="min-h-dvh lg:grid lg:grid-cols-[224px_minmax(0,1fr)]">
      <app-pro-sidebar class="hidden border-r border-line bg-sidebar lg:block" />
      <main class="min-w-0 lg:px-7 lg:pt-7 lg:pb-16 xl:px-9 2xl:px-12" [class]="showMobileNav() ? 'max-lg:pb-21' : ''">
        @if (showMobileNav()) {
          <!-- Mobile/tablet: marca + modo actual + menú de cuenta (en desktop están en el sidebar). En teléfonos angostos el cambio de modo vive en el menú ("Ver como cliente"). -->
          <header class="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-2.5 lg:hidden md:px-6">
            <a routerLink="/pro/dashboard" class="rounded-lg" aria-label="Resuelve, panel profesional"><app-logo /></a>
            <div class="flex items-center gap-2">
              <app-mode-switch mode="pro" class="max-[479px]:hidden" />
              <app-account-menu mode="pro" variant="compact" />
            </div>
          </header>
        }
        <router-outlet />
      </main>
    </div>
    @if (showMobileNav()) {
      <app-mobile-nav [items]="navItems()" label="Área profesional" />
    }
    <app-dialog [open]="showFirstSuccess()" labelledBy="first-success-title" describedBy="first-success-copy" [dismissable]="!celebrationBusy()" (dismiss)="continueFree()">
      <p class="text-sm font-semibold tracking-[0.12em] text-brand uppercase">Tu primer resultado</p>
      <h2 id="first-success-title" class="mt-2 font-display text-[28px] leading-tight font-bold tracking-[-0.02em]">🎉 Conseguiste tu primer cliente con Resuelve</h2>
      <p id="first-success-copy" class="mt-3 text-[15px] leading-relaxed text-ink-soft">Ya comprobaste cómo funciona. Con PRO podés seguir respondiendo sin límite y aprovechar todas las oportunidades.</p>
      <div class="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
        <button type="button" class="button-primary h-12 flex-1 rounded-xl px-4 text-[15px] font-semibold disabled:opacity-60" [disabled]="celebrationBusy()" (click)="continuePro()">Continuar con PRO</button>
        <button type="button" class="h-12 flex-1 rounded-xl px-4 text-[15px] font-semibold text-ink-soft hover:bg-sand" [disabled]="celebrationBusy()" (click)="continueFree()">Seguir con Free</button>
      </div>
    </app-dialog>
    }
  `,
})
export class ProShell {
  protected readonly auth = inject(AuthStore);
  private readonly route = inject(CurrentRoute);
  private readonly reqs = inject(ProRequestsStore);
  private readonly notifications = inject(NotificationsStore);
  private readonly pro = inject(ProStore);
  private readonly router = inject(Router);
  /** Solo las novedades cuya acción está en Solicitudes (nueva, te eligieron, necesitan otro horario). */
  private readonly requestsBadge = this.notifications.proRequestsNews;

  protected readonly navItems = computed<MobileNavItem[]>(() => [
    { label: 'Inicio', link: '/pro/dashboard', icon: 'home', activeOn: ['/pro/dashboard'] },
    {
      label: 'Solicitudes', link: '/pro/solicitudes', icon: 'list', activeOn: ['/pro/solicitudes'],
      badge: this.requestsBadge(),
      badgeLabel: newsLabel(this.requestsBadge(), 'Solicitudes'),
    },
    {
      label: 'Agenda', link: '/pro/agenda', icon: 'calendar', activeOn: ['/pro/agenda'],
      badge: this.notifications.proAgendaBadge(),
      badgeLabel: agendaLabel(this.notifications.proAgendaNews(), this.notifications.proCompletionDue()),
    },
    { label: 'Perfil', link: '/pro/perfil', icon: 'user', activeOn: ['/pro/perfil'] },
  ]);

  protected readonly showMobileNav = computed(() => this.route.data()['mobileNav'] === true);
  protected readonly showFirstSuccess = computed(() => !!this.pro.ownProfile()?.showFirstSuccessCelebration);
  protected readonly celebrationBusy = signal(false);

  constructor() {
    effect(() => {
      if (this.reqs.hasProfile()) untracked(() => this.reqs.loadPendingCount());
    });
  }

  protected async continueFree(): Promise<void> {
    if (this.celebrationBusy()) return;
    this.celebrationBusy.set(true);
    await this.pro.acknowledgeFirstSuccess();
    this.celebrationBusy.set(false);
  }

  protected async continuePro(): Promise<void> {
    if (this.celebrationBusy()) return;
    this.celebrationBusy.set(true);
    await this.pro.acknowledgeFirstSuccess();
    this.celebrationBusy.set(false);
    await this.router.navigate(['/pro/plan'], { queryParams: { quiero: '1' } });
  }
}
